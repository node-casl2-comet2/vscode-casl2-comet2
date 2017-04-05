"use strict";

import * as vscode from "vscode";
import { LanguageClient, TextDocumentIdentifier, RequestType } from "vscode-languageclient";
import { FixAllProblemsRequestParams, FixAllProblemsRequestResponse } from "@maxfield/node-casl2-language-server";
import { TextEdit, Range, Position } from "vscode-languageclient";
import { Messages } from "./constants";

export function applyTextEdits(uri: string, documentVersion: number, textEdits: TextEdit[]): void {
    if (textEdits.length == 0) return;

    const activeTextEditor = vscode.window.activeTextEditor;

    // 開いているTextEditorのファイルのURIと一致するか
    if (activeTextEditor && activeTextEditor.document.uri.toString() === uri) {
        if (activeTextEditor.document.version !== documentVersion) {
            vscode.window.showInformationMessage(Messages.CannotApplyFixBecauseOfFileChange);
        } else {
            activeTextEditor.edit(editBuilder => {
                for (const textEdit of textEdits) {
                    editBuilder.replace(
                        createVSCodeRange(textEdit.range), textEdit.newText
                    );
                }
            }).then(success => {
                if (!success) {
                    vscode.window.showErrorMessage(Messages.FailedToApplyFix);
                }
            });
        }
    }
}

export function fixAllProblems(client: LanguageClient) {
    return function (): void {
        const activeTextEditor = vscode.window.activeTextEditor;
        if (!activeTextEditor) return;

        const uri = activeTextEditor.document.uri.toString();
        const params: FixAllProblemsRequestParams = { textDocument: { uri } };
        client.sendRequest(
            new RequestType<FixAllProblemsRequestParams, FixAllProblemsRequestResponse, void, void>("textDocument/casl2-lint/fixAllProblems"), params)
            .then((response) => {
                applyTextEdits(uri, response.documentVersion, response.textEdits);
            }, (err) => {
                vscode.window.showErrorMessage(Messages.LanguageServerIPCError);
            });
    };
}

function createVSCodeRange(range: Range): vscode.Range {
    return new vscode.Range(
        createVSCodePosition(range.start),
        createVSCodePosition(range.end)
    );
}

function createVSCodePosition(position: Position): vscode.Position {
    return new vscode.Position(position.line, position.character);
}
