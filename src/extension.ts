"use strict";

import * as path from "path";

import { workspace, Disposable, ExtensionContext, languages } from "vscode";
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from "vscode-languageclient";
import Casl2SignatureHelpProvider from "./signatureHelpProvider";

export function activate(context: ExtensionContext) {

    // 言語サーバー
    const serverModule = context.asAbsolutePath(
        path.join("node_modules/@maxfield/node-casl2-language-server/dist/src", "server.js"));

    const debugOptions = { execArgv: ["--nolazy", "--debug=6009"] };

    // 拡張機能がデバッグモードで有効ならdebugオプションを使う
    // それ以外はrunオプションを使う
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    }

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ language: "casl2" }]
    }

    // クライアントを作成して開始する
    const languageClient = new LanguageClient(
        "node-casl2-language-server", "CASL 2 Language Server", serverOptions, clientOptions);

    const disposable = languageClient.start();

    context.subscriptions.push(disposable);
    context.subscriptions.push(
        languages.registerSignatureHelpProvider(
            [{ language: "casl2" }], new Casl2SignatureHelpProvider(languageClient), ","));
}
