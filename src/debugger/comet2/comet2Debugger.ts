"use strict";

import { Comet2, Comet2Option, Output, Input } from "@maxfield/node-comet2-core";
import { Casl2, Casl2CompileOption, Diagnostic, CompileResult } from "@maxfield/node-casl2-core";

export default class Comet2Debugger {
    private _casl2: Casl2;
    private _comet2: Comet2;
    private _sourcePath: string;
    private _compileResult: CompileResult;
    private _stdout: Output;
    private _stdin: Input;
    private _subroutineLines: Array<number>;
    private _stackFrames: Array<string>;

    set onstdout(stdout: Output) {
        this._stdout = stdout;
    }

    set onstdin(stdin: Input) {
        this._stdin = stdin;
    }

    get stackFrameCount() {
        return this._stackFrames.length;
    }

    constructor() {
        // TODO: 設定をクライアントと同期するようにする
        this._casl2 = new Casl2({
            useGR8: true,
            enableLabelScope: true
        });

        const stdout: Output = (s: string) => this._stdout(s);
        const stdin: Input = () => this._stdin();

        this._comet2 = new Comet2({
            useGR8AsSP: true
        }, stdin, stdout);
    }

    private getDebugInfo() {
        return this._compileResult.debuggingInfo!;
    }

    launch(sourcePath: string): Array<Diagnostic> {
        this._sourcePath = sourcePath;

        const compileResult = this._casl2.compile(sourcePath, true);
        this._compileResult = compileResult;
        this._subroutineLines = Array.from(compileResult.debuggingInfo!.subroutineMap.values());

        this._comet2.init(compileResult.hexes!);
        this._stackFrames = ["Main"];

        return compileResult.diagnostics;
    }

    stepInto(line: number): StepInfo {
        const inst = this.getState().nextInstruction!.name;
        // START命令は実際には何もしない
        if (this._subroutineLines.indexOf(line) != -1) {
            return {
                programEnd: false,
                nextLine: line + 1
            };
        }

        const end = this._comet2.stepInto();

        const pr = this.getState().PR;
        const isCall = inst === "CALL";
        const nextLine = this.getNextLine(pr, isCall);

        if (isCall) {
            const subroutine = this.getDebugInfo().subroutinesInfo.find(x => x.startLine == nextLine);
            if (subroutine === undefined) {
                throw new Error();
            }
            this._stackFrames.push(subroutine.subroutine);
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
        if (nextLine === undefined) throw new Error();
        return nextLine;
    }

    getState() {
        return this._comet2.getState();
    }
}

export interface StepInfo {
    programEnd: boolean;
    nextLine: number;
}
