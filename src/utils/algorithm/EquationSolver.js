import { toEvalSymbols } from './equationCore'

/**
 * 方程求解器类 - 求解包含未知数的算式
 * 支持多步运算、多种运算符组合、括号
 */

export class EquationSolver {
    constructor() {
        // 可以添加配置项
    }

    // 求解并自检
    static solve(equation, expected=null) {
        var result = this.solveByEval(equation);
        var isChecked = false;
        
        if (result !== null) {
            isChecked = this.checkResult(equation, expected || result);
        }
        
        // 如果解析法失败，用暴力法
        if (result === null || isChecked === false) {
            result = this.solveByBruteForce(equation);
            if (result !== null) {
                console.warn(`暴力法结果: ${result} (期望: ${expected}), isChecked: ${this.checkResult(equation, result)}`);
            }
        }
        // console.log(`求解结果: ${result} (期望: ${expected})`, `isChecked: ${isChecked}`);  // P5: 注释噪音日志
        return result;
    }
    
    /**
     * 求解方程
     * @param {string} equation - 题目字符串，如 "10-__-10=6" 或 "3+5×__=18" 或 "3+4="
     * @returns {number|null} 未知数的解
     */
    static solveByEval(equation) {
        // 标准化处理
        let expr = toEvalSymbols(equation)
            .replace(/\\s+/g, '')
            .replace('__', 'x');

        // 处理基本算式：如果以等号结尾，去掉等号
        if (expr.endsWith('=')) {
            expr = expr.slice(0, -1);
            try {
                return eval(expr);
            } catch (e) {
                console.error('基本算式计算错误:', e);
                return null;
            }
        }

        // 分离等式两边
        if (!expr.includes('=')) {
            console.log('原始方程:', equation);
            console.log('标准化:', expr);
            throw new Error('方程必须包含等号');
        }

        const [leftExpr, rightExpr] = expr.split('=');

        // P0: 右边是未知数 x → 结果在左边（基础算式如 7+6=__ → x=__ 被替换）
        if (rightExpr.trim() === 'x') {
            try {
                return eval(leftExpr);
            } catch (e) {
                console.error('左侧算式计算错误:', e);
                return null;
            }
        }

        // 计算右边的值
        let rightValue;
        try {
            rightValue = eval(rightExpr);
        } catch (e) {
            rightValue = parseFloat(rightExpr);
        }

        // 特殊情况：如果左边只有一个x
        if (leftExpr === 'x') {
            return rightValue;
        }

        // 解析左边的表达式，找到x的位置并求解
        return this._solveForX(leftExpr, rightValue);
    }

    /**
     * 递归求解未知数x
     * @private
     */
    static _solveForX(expr, target) {
        // 如果表达式就是x
        if (expr === 'x') {
            return target;
        }

        // 处理括号：如果整个表达式被括号包裹，去掉括号
        if (expr.startsWith('(') && expr.endsWith(')')) {
            expr = expr.substring(1, expr.length - 1);
        }

        // 找到最外层的运算符
        const opInfo = this._findOuterOperator(expr);
        if (!opInfo) {
            // 如果没有运算符，尝试直接解析
            if (expr.includes('x')) {
                // 形如 "2x" 或 "x2"
                if (expr.match(/^\\d+x$/)) {
                    const num = parseFloat(expr.replace('x', ''));
                    return target / num;
                }
                if (expr.match(/^x\\d+$/)) {
                    const num = parseFloat(expr.replace('x', ''));
                    return target / num;
                }
            }
            return null;
        }

        const { op, left, right } = opInfo;

        // 根据运算符和x的位置进行求解
        if (left.includes('x')) {
            // x在左边
            switch(op) {
                case '+': return this._solveForX(left, target - this._evaluateExpr(right));
                case '-': return this._solveForX(left, target + this._evaluateExpr(right));
                case '*': return this._solveForX(left, target / this._evaluateExpr(right));
                case '/': return this._solveForX(left, target * this._evaluateExpr(right));
            }
        } else if (right.includes('x')) {
            // x在右边
            switch(op) {
                case '+': return this._solveForX(right, target - this._evaluateExpr(left));
                case '-': return this._solveForX(right, this._evaluateExpr(left) - target);
                case '*': return this._solveForX(right, target / this._evaluateExpr(left));
                case '/': return this._solveForX(right, this._evaluateExpr(left) / target);
            }
        }

        return null;
    }

    /**
     * 简化括号内的表达式
     * @private
     */
    static _simplifyParentheses(expr, target) {
        // 查找最内层的括号对
        while (expr.includes('(')) {
            const match = expr.match(/\\(([^()]+)\\)/);
            if (!match) break;

            const innerExpr = match[1];
            const fullMatch = match[0];

            if (innerExpr.includes('x')) {
                // 如果括号内包含x，保留但标记
                return expr;
            } else {
                // 如果括号内不包含x，计算其值
                try {
                    const value = eval(innerExpr);
                    expr = expr.replace(fullMatch, value.toString());
                } catch (e) {
                    return expr;
                }
            }
        }
        return expr;
    }

    /**
     * 找到表达式最外层的运算符
     * @private
     */
    static _findOuterOperator(expr) {
        let parenthesesCount = 0;
        let operatorPos = -1;
        let operatorChar = '';

        // 从右向左找优先级最低的运算符（+、- 优先级低于 *、/）
        for (let i = expr.length - 1; i >= 0; i--) {
            const char = expr[i];

            if (char === ')') {
                parenthesesCount++;
            } else if (char === '(') {
                parenthesesCount--;
            } else if (parenthesesCount === 0) {
                // 不在括号内，检查运算符
                if (char === '+' || char === '-') {
                    operatorPos = i;
                    operatorChar = char;
                    break;
                } else if ((char === '*' || char === '/') && operatorPos === -1) {
                    operatorPos = i;
                    operatorChar = char;
                }
            }
        }

        if (operatorPos === -1) {
            return null;
        }

        const left = expr.substring(0, operatorPos);
        const right = expr.substring(operatorPos + 1);

        return { op: operatorChar, left, right };
    }

    /**
     * 计算不包含x的表达式
     * @private
     */
    static _evaluateExpr(expr) {
        if (!expr || expr === '') {
            return 0;
        }

        // 如果表达式被括号包裹，先去掉括号
        if (expr.startsWith('(') && expr.endsWith(')')) {
            expr = expr.substring(1, expr.length - 1);
        }

        if (!isNaN(parseFloat(expr)) && !expr.includes('x')) {
            return parseFloat(expr);
        }

        // 如果expr不包含x，可以计算
        if (!expr.includes('x')) {
            try {
                return eval(expr);
            } catch (e) {
                console.error('计算错误:', expr, e);
                return 0;
            }
        }

        return 0;
    }

    /**
     * 获取搜索范围（备用方案）
     * @private
     */
    static _getSearchRange(expr) {
        if (expr.includes('*') || expr.includes('/')) {
            return [1, 100];
        }
        return [0, 1000];
    }

    /**
     * 备用方案：暴力求解
     * @param {string} equation - 题目字符串
     * @returns {number|null} 未知数的解
     */
    static solveByBruteForce(equation) {
        const expr = toEvalSymbols(equation)
            .replace(/\\s+/g, '')
            .replace('__', 'x');

        // 处理基本算式
        if (expr.endsWith('=')) {
            try {
                return eval(expr.slice(0, -1));
            } catch (e) {
                return null;
            }
        }

        if (!expr.includes('=')) return null;

        const [left, right] = expr.split('=');
        let target;
        try {
            target = eval(right);
        } catch (e) {
            target = parseFloat(right);
        }

        const range = this._getSearchRange(left);

        for (let x = range[0]; x <= range[1]; x++) {
            try {
                let testExpr = left.replace(/x/g, x);

                // 处理括号
                while (testExpr.includes('(')) {
                    const match = testExpr.match(/\\(([^()]+)\\)/);
                    if (!match) break;
                    const value = eval(match[1]);
                    testExpr = testExpr.replace(match[0], value);
                }

                const result = eval(testExpr);
                if (Math.abs(result - target) < 0.0001) {
                    return x;
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    }
    
    /**
     * 检查方程的计算结果是否正确
     * @param {string} equation - 题目字符串，可能包含或不包含__
     * @param {number|string} inResult - 用户输入的答案或方程的结果
     * @returns {boolean} 等式是否成立
     */
    static checkResult(equation, inResult) {
        // 标准化处理
        let expr = toEvalSymbols(equation)
            .replace(/\\s+/g, '');

        let result = inResult;
        if(!result && result !== 0){
            result = this.solveByEval(equation);
        }
        
        // 情况1：方程中包含 __（求未知项题型）
        if (expr.includes('__')) {
            // 分离等式两边
            const [leftPattern, rightPattern] = expr.split('=');

            // 根据 __ 的位置和符号决定如何替换
            let leftExpr;

            // 检查 __ 前面是什么运算符
            const underscoreIndex = leftPattern.indexOf('__');
            const prevChar = underscoreIndex > 0 ? leftPattern[underscoreIndex - 1] : '';

            if (prevChar === '-') {
                // 如果是 "-__"，且 result 是负数，要特别处理
                if (result < 0) {
                    // "-__" 后面是负数，变成 "-(-6)" = "+6"
                    leftExpr = leftPattern.replace('__', `(${result})`);
                } else {
                    leftExpr = leftPattern.replace('__', result.toString());
                }
            } else if (prevChar === '+') {
                // "+__" 后面是负数，变成 "+(-6)" = "-6"
                leftExpr = leftPattern.replace('__', `(${result})`);
            } else {
                // 其他情况
                leftExpr = leftPattern.replace('__', result.toString());
            }

            try {
                const leftVal = eval(leftExpr);
                // P0: __ 在等号右边时，rightPattern 是未知数，直接比较结果
                if (rightPattern.trim() === '__') {
                    return Math.abs(leftVal - parseFloat(result)) < 0.0001;
                }
                const rightVal = eval(rightPattern);
                return Math.abs(leftVal - rightVal) < 0.0001;
            } catch (e) {
                console.error('计算错误:', e.message);
                return false;
            }
        } 
        // 情况2：方程中不包含 __（求结果题型）
        else {
            if (expr.includes('=') && !expr.endsWith('=')) {
                const [left, right] = expr.split('=');
                try {
                    const leftVal = eval(left);
                    const rightVal = parseFloat(right);
                    return Math.abs(leftVal - rightVal) < 0.0001;
                } catch (e) {
                    console.error('计算错误:', e.message);
                    return false;
                }
            } else {
                // 处理基本算式 "3+4="
                try {
                    const exprVal = eval(expr.slice(0, -1));
                    return Math.abs(exprVal - parseFloat(result)) < 0.0001;
                } catch (e) {
                    console.error('基本算式检查错误:', e);
                    return false;
                }
            }
        }
    }
}

// ============ 测试用例 ============
function runTests() {
    const solver = EquationSolver;
    
    const testCases = [
        { input: "10-__-10=6", expected: -6 },
        { input: "3+5×__=18", expected: 3 },
        { input: "__+5-3=10", expected: 8 },
        { input: "20-__×2=10", expected: 5 },
        { input: "15÷__+5=10", expected: 3 },
        { input: "(__+5)×2=20", expected: 5 },
        { input: "24÷(__-2)=6", expected: 6 },
        { input: "10-__=6", expected: 4 },
        { input: "__+5=12", expected: 7 },
        { input: "__-3=7", expected: 10 },
        { input: "5×__=30", expected: 6 },
        { input: "24÷__=6", expected: 4 },
        { input: "3+4=", expected: 7 },
        { input: "5×6=", expected: 30 },
        { input: "15÷3=", expected: 5 },
    ];
    
    console.log('======== 测试开始 ========');
    testCases.forEach((test, index) => {
        console.log(`\\n测试 ${index + 1}: ${test.input}`);
        
        // 先用解析法
        let result = solver.solve(test.input);
        console.log(`解析法结果: ${result} (期望: ${test.expected})`);
    });
}

// 运行测试
//runTests();

// 导出模块（支持 CommonJS 和 ES6）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EquationSolver };
} else if (typeof define === 'function' && define.amd) {
    define([], () => EquationSolver);
} else {
    window.EquationSolver = EquationSolver;
}
