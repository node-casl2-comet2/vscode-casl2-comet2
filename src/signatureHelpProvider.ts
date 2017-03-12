"use strict";

import {
    SignatureHelpProvider, SignatureHelp, SignatureInformation, ParameterInformation,
    TextDocument, Position, CancellationToken,
} from "vscode";
import { LanguageClient, ExecuteCommandRequest } from "vscode-languageclient";


export default class Casl2SignatureHelpProvider implements SignatureHelpProvider {
    constructor(private _client: LanguageClient) {

    }

    provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): SignatureHelp | Thenable<SignatureHelp | null | undefined> | null | undefined {
        return this._client.sendRequest<SignatureHelp>("textDocument/signatureHelp").then(signatureHelp => {
            return signatureHelp;
        });
    }
}
