"use strict";

import * as vscode from "vscode";
import { TextEdit, Range, Position } from "vscode-languageclient";
import { Messages } from "./constants";

export function applyTextEdit(uri: string, documentVersion: number, textEdit: TextEdit): void {
    const activeTextEditor = vscode.window.activeTextEditor;

    // 開いているTextEditorのファイルのURIと一致するか
    if (activeTextEditor && activeTextEditor.document.uri.toString() === uri) {
        if (activeTextEditor.document.version !== documentVersion) {
            vscode.window.showInformationMessage(Messages.CannotApplyFixBecauseOfFileChange);
        } else {
            activeTextEditor.edit(editBuilder => {
                editBuilder.replace(
                    createVSCodeRange(textEdit.range), textEdit.newText
                );
            }).then(success => {
                if (!success) {
                    vscode.window.showErrorMessage(Messages.FailedToApplyFix);
                }
            });
        }
    }
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
