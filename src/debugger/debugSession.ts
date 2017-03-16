"use strict";

import {
    DebugSession,
    InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Event,
    Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { readFileSync } from "fs";
import { basename } from "path";
import { LaunchRequestArguments } from "./launchRequestArguments";


export default class Comet2DebugSession extends DebugSession {
    // マルチスレッドに対応しないので，決め打ちでデフォルトスレッドのIDを決めている
    private static THREAD_ID = 1;

    private _breakpointId = 1000;

    // This is the next line that will be 'executed'
    private __currentLine = 0;
    private get _currentLine(): number {
        return this.__currentLine;
    }
    private set _currentLine(line: number) {
        this.__currentLine = line;
        this.log("line", line);
    }

    // デバッグするファイル名
    private _sourceFile: string;

    // デバッグするファイルの内容
    private _sourceLines = new Array<string>();

    // ファイルとファイルに付けられたブレークポイントの対応表
    private _breakPoints = new Map<string, DebugProtocol.Breakpoint[]>();

    private _variableHandles = new Handles<string>();

    public constructor() {
        super();

        // テキストの先頭を0行目0文字目とする(zero-based)
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }

	/**
	 * 最初のデバッガーへの問い合わせ
	 */
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        // フロントエンドに完了を通知する
        this.sendEvent(new InitializedEvent());

        if (response.body !== undefined) {
            response.body.supportsConfigurationDoneRequest = true;

            // 変数などにホバーしたら式を評価して表示する
            response.body.supportsEvaluateForHovers = true;

            // ステップバックボタンを表示させる
            // response.body.supportsStepBack = true;
        }

        this.sendResponse(response);
    }

    // 起動時に実行される
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
        // ファイル名を受け取る
        this._sourceFile = args.program;
        // ファイルの内容を読み込む
        this._sourceLines = readFileSync(this._sourceFile).toString().split("");

        // configで'stopOnEntry'がtrueになら
        // ブレークポイントが設定されていなくても一行目でストップさせる
        if (args.stopOnEntry) {
            this._currentLine = 0;
            this.sendResponse(response);

            // 一行目で停止する
            this.sendEvent(new StoppedEvent("entry", Comet2DebugSession.THREAD_ID));
        } else {
            // ブレークポイントや例外に当たるまで進める
            this.continueRequest(<DebugProtocol.ContinueResponse>response, { threadId: Comet2DebugSession.THREAD_ID });
        }
    }

    // 設定されたブレークポイント(複数)の情報を受け取る
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        const path = args.source.path!;
        // ブレークポイントが付けられている行数を取得する
        // TODO: args.linesはdeprecatedなので修正
        const clientLines = args.lines!;

        // read file contents into array for direct access
        const lines = readFileSync(path).toString().split("");

        const breakpoints = new Array<Breakpoint>();

        // verify breakpoint locations
        for (let i = 0; i < clientLines.length; i++) {
            // debuggerにおける行数を変換する
            const l = this.convertClientLineToDebugger(clientLines[i]);
            const breakpoint = <DebugProtocol.Breakpoint>new Breakpoint(true, this.convertDebuggerLineToClient(l));
            // ブレークポイントIDを設定する
            breakpoint.id = this._breakpointId++;
            breakpoints.push(breakpoint);
        }

        // ファイル名とともにブレークポイントを保持しておく
        this._breakPoints.set(path, breakpoints);

        response.body = {
            breakpoints: breakpoints
        };
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [
                new Thread(Comet2DebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        // TODO: 関数呼び出しの関係をスタックトレースに表示する

        // スペースで区切って単語に分ける
        const words = ["hello"];

        const startFrame = typeof args.startFrame === "number" ? args.startFrame : 0;
        const maxLevels = typeof args.levels === "number" ? args.levels : words.length - startFrame;
        const endFrame = Math.min(startFrame + maxLevels, words.length);

        const frames = new Array<StackFrame>();
        for (let i = startFrame; i < endFrame; i++) {
            const name = words[i];
            const frame = new StackFrame(i, `${name}(${i})`, new Source(basename(this._sourceFile),
                this.convertDebuggerPathToClient(this._sourceFile)),
                this.convertDebuggerLineToClient(this._currentLine), 0);

            frames.push(frame);
        }

        response.body = {
            stackFrames: frames,
            totalFrames: words.length
        };
        this.sendResponse(response);
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        const frameReference = args.frameId;
        const scopes = new Array<Scope>();
        scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));
        scopes.push(new Scope("Closure", this._variableHandles.create("closure_" + frameReference), false));
        scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));

        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        // TODO: GR, SP, PR, FR(OF, SF, ZF)の値を表示する

        const variables: Array<DebugProtocol.Variable> = [];
        const id = this._variableHandles.get(args.variablesReference);
        variables.push({
            name: id + "_i",
            type: "integer",
            value: "123",
            variablesReference: 0
        });
        variables.push({
            name: id + "_f",
            type: "float",
            value: "3.14",
            variablesReference: 0
        });
        variables.push({
            name: id + "_s",
            type: "string",
            value: "hello world",
            variablesReference: 0
        });
        variables.push({
            name: id + "_o",
            type: "object",
            value: "Object",
            variablesReference: this._variableHandles.create("object_")
        });

        response.body = {
            variables: variables
        };

        this.sendResponse(response);
    }

    // 緑の再生ボタンが押された時
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        for (let ln = this._currentLine + 1; ln < this._sourceLines.length; ln++) {
            // ブレークポイントなどで止まる必要があればまた止まる
            if (this.fireEventsForLine(response, ln)) {
                return;
            }
        }

        // これ以上行がなければデバッグを終了する
        this.sendResponse(response);
        this.sendEvent(new TerminatedEvent());
    }

    // TODO: COMET2のステップバックが実装されたら実装する
    // 緑の逆再生ボタンが押された時
    // protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments): void {
    //     for (let ln = this._currentLine - 1; ln >= 0; ln--) {
    //         if (this.fireEventsForLine(response, ln)) {
    //             return;
    //         }
    //     }

    //     // 最初の行に戻ったら止める
    //     this.sendResponse(response);
    //     this._currentLine = 0;
    //     this.sendEvent(new StoppedEvent("entry", Comet2DebugSession.THREAD_ID));
    // }
    //
    // TODO: COMET2のステップバックが実装されたら実装する
    //
    // protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments): void {
    //     for (let ln = this._currentLine - 1; ln >= 0; ln--) {
    //         if (this.fireStepEvent(response, ln)) {
    //             return;
    //         }
    //     }

    //     // 最初の行に戻ったら止める
    //     this.sendResponse(response);
    //     this._currentLine = 0;
    //     this.sendEvent(new StoppedEvent("entry", Comet2DebugSession.THREAD_ID));
    // }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        for (let ln = this._currentLine + 1; ln < this._sourceLines.length; ln++) {
            if (this.fireStepEvent(response, ln)) {
                return;
            }
        }

        // 最後の行ならデバッグを終了する
        this.sendResponse(response);
        this.sendEvent(new TerminatedEvent());
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        response.body = {
            result: `evaluate(context: '${args.context}', '${args.expression}')`,
            variablesReference: 0
        };

        this.sendResponse(response);
    }

	/**
	 * 空行でなければブレークする
	 */
    private fireStepEvent(response: DebugProtocol.Response, ln: number): boolean {
        if (this._sourceLines[ln].trim().length > 0) {
            this._currentLine = ln;
            this.sendResponse(response);
            this.sendEvent(new StoppedEvent("step", Comet2DebugSession.THREAD_ID));
            return true;
        }

        return false;
    }

	/**
	 * ブレークポイントや例外が発生したらブレークする
	 */
    private fireEventsForLine(response: DebugProtocol.Response, ln: number): boolean {
        // 対象のファイルのブレークポイントを取得する
        const breakpoints = this._breakPoints.get(this._sourceFile);

        // ブレークポイントがあれば止める
        if (breakpoints) {
            const bps = breakpoints.filter(bp => bp.line === this.convertDebuggerLineToClient(ln));
            if (bps.length > 0) {
                this._currentLine = ln;

                this.sendResponse(response);

                this.sendEvent(new StoppedEvent("breakpoint", Comet2DebugSession.THREAD_ID));
                return true;
            }
        }

        const exceptionThrown = false;
        // 例外が発生したら例外としてブレークする
        if (exceptionThrown) {
            this._currentLine = ln;
            this.sendResponse(response);
            this.sendEvent(new StoppedEvent("exception", Comet2DebugSession.THREAD_ID));
            this.log("exception in line", ln);
            return true;
        }

        return false;
    }

    private log(msg: string, line: number) {
        const e = new OutputEvent(`${msg}: ${line}\n`);
        (<DebugProtocol.OutputEvent>e).body.variablesReference = this._variableHandles.create("args");

        // デバッグコンソールに現在の行を表示する
        this.sendEvent(e);
    }
}
