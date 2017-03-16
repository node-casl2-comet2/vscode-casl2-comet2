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
import Comet2Debugger from "./comet2/comet2Debugger";
import { printDiagnostic } from "./ui/print";


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

    private _debugger: Comet2Debugger;

    public constructor() {
        super();

        // テキストの先頭を0行目0文字目とする(zero-based)
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);

        this._debugger = new Comet2Debugger();

        this._debugger.onstdout = (s: string) => {
            this.sendEvent(new OutputEvent(s, "stdout"));
        };
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

        const diagnostics = this._debugger.launch(this._sourceFile);

        const successCompile = diagnostics.length == 0;

        if (successCompile) {
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
        } else {
            // Outputイベントのcategoryを'stderr'にすると
            // vscodeで赤字で表示される
            this.sendEvent(new OutputEvent("コンパイルエラー", "stderr"));
            diagnostics
                .map(diagnostic => new OutputEvent(printDiagnostic(diagnostic), "stderr"))
                .forEach(event => this.sendEvent(event));

            this.sendResponse(response);
            this.sendEvent(new TerminatedEvent());
        }
    }

    // 設定されたブレークポイント(複数)の情報を受け取る
    // デバッグモードに入る時とデバッグモード中に
    // ブレークポイントを追加または削除した時に呼び出される
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        const path = args.source.path!;

        if (args.breakpoints) {
            // ブレークポイントが付けられている行数を取得する
            const breakPointLines = args.breakpoints.map(x => x.line);
            const lines = readFileSync(path).toString().split("");

            const breakpoints = new Array<Breakpoint>();

            for (const bpLine of breakPointLines) {
                const verify = true;
                const breakpoint = <DebugProtocol.Breakpoint>new Breakpoint(verify, bpLine);
                // ブレークポイントIDを設定する
                breakpoint.id = this._breakpointId++;
                breakpoints.push(breakpoint);
            }

            // ファイル名とともにブレークポイントを保持しておく
            this._breakPoints.set(path, breakpoints);

            response.body = {
                breakpoints: breakpoints
            };
        } else {
            this._breakPoints.set(path, []);
        }

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

        const state = this._debugger.getState();
        const grs = state.GR;

        variables.push({
            name: "GR0",
            type: "integer",
            value: grs.GR0.toString(),
            variablesReference: 0
        });

        variables.push({
            name: "GR1",
            type: "integer",
            value: grs.GR1.toString(),
            variablesReference: 0
        });

        variables.push({
            name: "GR2",
            type: "integer",
            value: grs.GR2.toString(),
            variablesReference: 0
        });

        variables.push({
            name: "GR3",
            type: "integer",
            value: grs.GR3.toString(),
            variablesReference: 0
        });

        variables.push({
            name: "PR",
            type: "integer",
            value: state.PR.toString(),
            variablesReference: 0
        });

        response.body = {
            variables: variables
        };

        this.sendResponse(response);
    }

    // 緑の再生ボタンが押された時
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        for (let nextLine = this._currentLine + 1; nextLine < this._sourceLines.length; nextLine++) {
            const programEnd = this._debugger.step(nextLine - 1);
            if (programEnd) {
                this.sendResponse(response);
                this.sendEvent(new TerminatedEvent());
                return;
            }

            // ブレークポイントなどで止まる必要があればまた止まる
            if (this.fireEventsForLine(response, nextLine)) {
                return;
            }
        }

        // これ以上行がなければデバッグを終了する
        this.sendResponse(response);
        this.sendEvent(new TerminatedEvent());
    }

    // vscodeのStep Overに相当
    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        console.log("Step Over");
        this.sendResponse(response);
    }

    // vscodeのStep Intoに相当
    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        // 一行実行して停止
        const nextLine = this._currentLine + 1;
        const programEnd = this._debugger.step(nextLine - 1);

        if (programEnd) {
            this.sendResponse(response);
            this.sendEvent(new TerminatedEvent());
            return;
        }

        this.sendResponse(response);
        // this._currentLineを設定することでストップする位置を知らせる
        this._currentLine = nextLine;
        // 停止
        this.sendEvent(new StoppedEvent("step", Comet2DebugSession.THREAD_ID));
    }

    // vscodeのStep Outに相当
    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        console.log("Step Out");
        this.sendResponse(response);
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        response.body = {
            result: `evaluate(context: '${args.context}', '${args.expression}')`,
            variablesReference: 0
        };

        this.sendResponse(response);
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

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [
                new Thread(Comet2DebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
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
}
