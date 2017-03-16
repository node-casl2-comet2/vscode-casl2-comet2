"use strict";

import { DebugProtocol } from "vscode-debugprotocol";

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
}
