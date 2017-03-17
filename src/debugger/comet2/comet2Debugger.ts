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

    set onstdout(stdout: Output) {
        this._stdout = stdout;
    }

    set onstdin(stdin: Input) {
        this._stdin = stdin;
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

    launch(sourcePath: string): Array<Diagnostic> {
        this._sourcePath = sourcePath;

        const compileResult = this._casl2.compile(sourcePath, true);
        this._compileResult = compileResult;
        this._subroutineLines = Array.from(compileResult.debuggingInfo!.subroutineMap.values());

        this._comet2.init(compileResult.hexes!);

        return compileResult.diagnostics;
    }

    stepInto(line: number): boolean {
        if (this._subroutineLines.indexOf(line) !== -1) {
            // START命令は実際には何もしない
            return false;
        }

        const end = this._comet2.stepInto();
        return end;
    }

    getState() {
        return this._comet2.getState();
    }
}
