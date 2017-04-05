"use strict";

import { Comet2, Comet2Option, Output, Input } from "@maxfield/node-comet2-core";
import { Casl2, Casl2CompileOption, Diagnostic, CompileResult } from "@maxfield/node-casl2-core";
import * as _ from "lodash";

export class Comet2Debugger {
    private _casl2: Casl2;
    private _comet2: Comet2;
    private _sourcePath: string;
    private _compileResult: CompileResult;
    private _stdout: Output;
    private _stdin: Input | undefined;
    private _subroutineLines: number[];
    private _stackFrames: SubroutineCallInfo[];

    set onstdout(stdout: Output) {
        this._stdout = stdout;
    }

    setInput(s: string) {
        this._stdin = () => s;
    }

    get stackFrameCount() {
        return this._stackFrames.length;
    }

    get stackFrames() {
        return this._stackFrames;
    }

    constructor(casl2Options: Casl2CompileOption, comet2Options: Comet2Option) {
        this._casl2 = new Casl2(casl2Options);

        const stdout: Output = (s: string) => this._stdout(s);
        const stdin: Input = () => this._stdin!();
        this._comet2 = new Comet2(comet2Options, stdin, stdout);
    }

    private getDebugInfo() {
        return this._compileResult.debuggingInfo!;
    }

    launch(sourcePath: string): Diagnostic[] {
        this._sourcePath = sourcePath;

        const compileResult = this._casl2.compile(sourcePath, true);
        this._compileResult = compileResult;
        this._subroutineLines = Array.from(compileResult.debuggingInfo!.subroutineMap.values());

        if (compileResult.hexes !== undefined) {
            this._comet2.init(compileResult.hexes);
        }

        // 最初のSTART命令のラベルをスタックフレームに積んでおく
        const entryPoint = _.minBy(this.getDebugInfo().subroutinesInfo, x => x.startLine).subroutine;
        this._stackFrames = [{ subroutine: entryPoint, callLine: -1 }];
        return compileResult.diagnostics;
    }

    stepInto(executeLine: number): StepInfo {
        // START命令は実際には何もしない
        if (this._subroutineLines.indexOf(executeLine) != -1) {
            return {
                programEnd: false,
                nextLine: executeLine + 1
            };
        }

        const inst = this.getState().nextInstruction!.name;
        const isIn = inst === "IN";
        if (isIn && this._stdin === undefined) {
            // 入力を受け付ける
            return {
                programEnd: false,
                requestInput: true,
                nextLine: executeLine
            };
        }

        const end = this._comet2.stepInto();
        if (isIn) {
            this._stdin = undefined;
        }

        const pr = this._comet2.PR;
        const isCall = inst === "CALL";
        const nextLine = this.getNextLine(pr, isCall);

        if (isCall) {
            const subroutine = this.getDebugInfo().subroutinesInfo.find(x => x.startLine == nextLine);
            if (subroutine === undefined) {
                throw new Error();
            }
            this._stackFrames[this._stackFrames.length - 1].callLine = executeLine;
            this._stackFrames.push({
                subroutine: subroutine.subroutine,
                callLine: -1
            });
        }
        if (inst === "RET") {
            this._stackFrames.pop();
        }
        return {
            programEnd: end,
            nextLine: nextLine
        };
    }

    getNextLine(address: number, isCall: boolean) {
        const map = isCall
            ? this._compileResult.debuggingInfo!.subroutineMap
            : this._compileResult.debuggingInfo!.addressLineMap;

        const nextLine = map.get(address);
        if (nextLine === undefined) {
            // 任意の命令行のアドレスに相当しないような
            // アドレスにジャンプしようとした場合
            return -1;
        }
        return nextLine;
    }

    getState() {
        return this._comet2.getState();
    }
}

export interface StepInfo {
    programEnd: boolean;
    requestInput?: boolean;
    nextLine: number;
}

export interface SubroutineCallInfo {
    /**
     * サブルーチンをコールしたサブルーチン名
     */
    subroutine: string;

    /**
     * サブルーチンをコールしたCALL命令の行番号
     */
    callLine: number;
}
