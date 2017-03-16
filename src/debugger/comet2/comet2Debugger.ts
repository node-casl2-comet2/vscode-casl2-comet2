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

        const compileResult = this._casl2.compile(sourcePath);
        this._compileResult = compileResult;

        return compileResult.errors;
    }

    run(): void {
        if (this._compileResult === undefined) throw new Error();

        const { success, hexes } = this._compileResult;
        if (!success || hexes === undefined) throw new Error();

        this._comet2.init(hexes);

        while (true) {
            const end = this._comet2.run();
            if (end) {
                break;
            }
        }
    }
}
