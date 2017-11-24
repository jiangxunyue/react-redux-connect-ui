/**
 * Use a Higher UI to achieve the goal of reselect;
* */
import React, {Component} from 'react';
import {connect} from 'react-redux';
import invariant from 'fbjs/lib/invariant';

function disassembleParamsAndSelector(mapStateToProps, state) {
    if (!mapStateToProps) return {};
    invariant(typeof mapStateToProps === 'function', "function connetUI\'s first param must be the type of function , null, undefine");
    let returnValue = mapStateToProps(state);
    let stateOnProps = {};
    for (let key in returnValue) {
        if (!returnValue.hasOwnProperty(key)) continue;
        let value = returnValue[key];
        stateOnProps[key] = {};
        if (Array.isArray(value) && (value[value.length -1] instanceof Function)) {
            invariant(value.length > 1, 'function connetUI mapStateToProps\'s selectors list must larger than 1');
            stateOnProps[key].params = value.slice(0, value.length - 1);
            stateOnProps[key].selector = value[value.length -1];
        }else if (value instanceof Function) {
            stateOnProps[key].params = [state];
            stateOnProps[key].selector = value;
        }else {
            stateOnProps[key].params = [state];
            stateOnProps[key].selector = () => value;
        }
    }
    return stateOnProps;
}

function calculateNewChildProps(newSelectorObj, oldSelectorObj, oldProps) {
    let nextProps = {};
    for (let key in newSelectorObj) {
        if (!newSelectorObj.hasOwnProperty(key)) return;
        let newSelectorObjForKey = newSelectorObj[key];
        if (oldSelectorObj && oldProps) {
            let oldSelectorObjForKey = oldSelectorObj[key];
            let paramsIsChange = newSelectorObjForKey.params.some((item, index) => item !== oldSelectorObjForKey.params[index]);
            if (!paramsIsChange) {
                nextProps[key] = oldProps[key];
            }else {
                nextProps[key] = newSelectorObjForKey.selector(...newSelectorObjForKey.params);
            }
        }else {
            nextProps[key] = newSelectorObjForKey.selector(...newSelectorObjForKey.params);
        }
    }
    return nextProps;
}

/**
 * 检查state是否发生了改变, 浅比较
 * @param thisState
 * @param nextState
 * @returns {boolean}
 */
function isStateChange(thisState, nextState) {
    for (let key in nextState) {
        if (thisState[key] !== nextState[key]) {
            return true;
        }
    }
    return false;
}

/**
 * 检查props中指定的属性是否发生了改变, 浅比较
 * @param mapKey 需要检查的属性key
 * @param thisProps
 * @param nextProps
 * @returns {boolean}
 */
function isPropsChange(mapKey = [], thisProps, nextProps) {
    for (let index in mapKey) {
        let key = mapKey[index];
        if (thisProps[key] !== nextProps[key]) {
            return true;
        }
    }
    return false;
}


function connetUI(...args) {
    return function (UI) {
        args = args || [];
        let mapStateToProps = args[0];
        let mapDispatchToProps = args[1];
        let withRef = !!args[2];
        class NewUI extends Component {
            constructor(props) {
                super(props);
                this.paramsAndSelectors = disassembleParamsAndSelector(mapStateToProps, props.$$reduxState);
                this.state = {
                    childProps: calculateNewChildProps(this.paramsAndSelectors)
                };
            }
            _refView = null;
            get inner() {
                return this._refView
            }
            componentWillReceiveProps(nextProps) {
                let paramsAndSelectors = disassembleParamsAndSelector(mapStateToProps, nextProps.$$reduxState);
                let newChildProps = calculateNewChildProps(paramsAndSelectors, this.paramsAndSelectors, this.state.childProps);
                this.setState({
                    childProps: newChildProps
                });
                this.paramsAndSelectors = paramsAndSelectors;
            }

            shouldComponentUpdate(nextProps, nextState) {
                return isStateChange(this.state.childProps, nextState.childProps);
            }
            render() {
                return <UI {...this.props} {...this.state.childProps} ref={view => this._refView = view}/>
            }
        }
        let mapState = state => ({$$reduxState: state});
        return connect(mapStateToProps? mapState: null, mapDispatchToProps, null, {withRef: withRef})(NewUI);
    }
}

const RESELECT_TYPE = Symbol.for('connect-ui-reselect');

function checkArgs(...args) {
    Array.prototype.forEach.call(args, item => invariant(item instanceof Function, 'fucntion creatSelector\'s parameters must be function'))
}

function createSelectorCreator(cacheSize, equalityCheck) {
    invariant(cacheSize > 0, 'function createSelectorCreator\'s cacheSize parameter must bigger than 0')
    return function createSelector(...args) {
        checkArgs(...args);
        let selector = args[args.length -1];
        if (args.length > 1) {
            let params = Array.prototype.slice.call(args, 0, args.length -1);
            let prevParamsArray = [];
            let prevResultArray = [];
            let prevArray = [prevParamsArray, prevResultArray];
            let newSelector = function (state) {
                let currentParams = params.map(param => param(state));
                let currentResult = null;
                if (prevParamsArray.length > 0) {
                    let equalIndex = -1;
                    for (let index = prevParamsArray.length - 1; index >= 0; index--) {
                        let prevParams = prevParamsArray[index];
                        let hasChange = currentParams.some((item, index) => !equalityCheck(item, prevParams[index]));
                        if (hasChange) {
                            continue;
                        }else {
                            equalIndex = index;
                            break;
                        }
                    }
                    if (equalIndex === -1) {
                        currentResult = selector(...currentParams);
                        let currentArray = [currentParams, currentResult];
                        prevArray.forEach((array, index) => {
                            array.push(currentArray[index]);
                        });
                        if (prevParamsArray.length > cacheSize) {
                            prevArray.forEach(array => array.shift());
                        }
                    }else {
                        currentResult = prevResultArray[equalIndex];
                        if (equalIndex !== prevParamsArray.length -1) {
                            prevArray.forEach(array => array.splice(equalIndex, 1));
                            let currentArray = [currentParams, currentResult];
                            prevArray.forEach((array, index) => {
                                array.push(currentArray[index]);
                            });
                        }
                    }
                }else {
                    currentResult = selector(...currentParams);
                    let currentArray = [currentParams, currentResult];
                    prevArray.forEach((array, index) => {
                        array.push(currentArray[index]);
                    });
                }
                return currentResult;
            };
            newSelector.$$type = RESELECT_TYPE;
            return newSelector;
        }else {
            return selector
        }
    }
}

function defalutEqulityChecker(newValue, oldValue) {
    return newValue === oldValue;
}

let createSelector = createSelectorCreator(1, defalutEqulityChecker);

module.exports = {
    connetUI,
    createSelector,
    createSelectorCreator
}