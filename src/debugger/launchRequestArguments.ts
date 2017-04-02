"use strict";

import { DebugProtocol } from "vscode-debugprotocol";
import { Comet2Option } from "@maxfield/node-comet2-core";
import { Casl2CompileOption } from "@maxfield/node-casl2-core";

// vscodeのlaunch.jsonに以下のようなデバッグ設定が記述されている
// 'program'や'stopOnEntry'など，設定プロパティに合わせてインターフェースを作る
// {
//     "type": "comet2",
//     "request": "launch",
//     "name": "Debug current file",
//     "program": "${file}",
//     "stopOnEntry": false
// }

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    program: string;
    stopOnEntry?: boolean;
    commonOptions?: Casl2Comet2CommonOptions;
    comet2Options?: Comet2Option;
    casl2Options?: Casl2CompileOption;
}

export interface Casl2Comet2CommonOptions {
    useGR8AsSP?: boolean | string;
}

export function resolveFlag(flag: boolean | string | undefined): boolean | undefined {
    if (flag === undefined) return undefined;

    return typeof flag === "boolean"
        ? flag
        : flag === "true";
}
