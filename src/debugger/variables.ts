"use strict";

import { DebugProtocol } from "vscode-debugprotocol";


export function createVariable(gr: string, value: number): DebugProtocol.Variable {
    // JavaScriptのobjectのように
    // 階層的に展開されるべき変数はないので
    // variablesReferenceはすべて0でよい
    return {
        name: gr,
        type: "integer",
        value: value.toString(),
        variablesReference: 0
    };
}

export const boolToBin = (b: boolean) => b ? 1 : 0;
