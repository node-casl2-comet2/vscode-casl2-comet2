"use strict";

import {
    DebugSession,
    InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Event,
    Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { readFileSync } from "fs";
import * as path from "path";
import { LaunchRequestArguments } from "./launchRequestArguments";
import Comet2Debugger from "./comet2/comet2Debugger";
import { printDiagnostic } from "./ui/print";
import { createVariable, boolToBin } from "./variables";


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

        this._currentLine = 0;
        if (successCompile) {
            // configで'stopOnEntry'がtrueになら
            // ブレークポイントが設定されていなくても一行目でストップさせる
            if (args.stopOnEntry) {
                this.sendResponse(response);

                // 一行目で停止する
                this.sendEvent(new StoppedEvent("entry", Comet2DebugSession.THREAD_ID));
            } else {
                if (this.hitBreakPointOrException(response, this._currentLine)) {
                    return;
                }

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
            const breakPointLines = args.breakpoints
                .map(x => this.convertClientLineToDebugger(x.line));

            const breakpoints = new Array<Breakpoint>();

            // launchイベントよりも先にリクエストされるので
            // 直接ファイルを読むことで対応することになる
            const lines = readFileSync(path).toString().split(/\r?\n/);
            const ignoreLineRegex = /^\s*(;.*)?$/;
            for (const bpLine of breakPointLines) {
                // TODO: テストする
                // 空白行やコメント行にはブレークポイントを許可しない
                const line = lines[bpLine];
                const verify = (line.match(ignoreLineRegex) || undefined) === undefined;
                const breakpoint = <DebugProtocol.Breakpoint>new Breakpoint(verify, this.convertDebuggerLineToClient(bpLine));
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
        const stackframes = this._debugger.stackFrames;

        const startFrame = typeof args.startFrame === "number" ? args.startFrame : 0;
        const maxLevels = typeof args.levels === "number" ? args.levels : stackframes.length - startFrame;
        const endFrame = Math.min(startFrame + maxLevels, stackframes.length);

        const frames = new Array<StackFrame>();
        for (let i = endFrame - 1; i >= startFrame; i--) {
            const stackframe = stackframes[i];
            const frameNumber = i;
            const frameName = stackframe.subroutine;
            const source = new Source(path.basename(this._sourceFile), this.convertDebuggerPathToClient(this._sourceFile));
            const line = i == endFrame - 1
                ? this.convertDebuggerLineToClient(this._currentLine)
                : this.convertDebuggerLineToClient(stackframe.callLine);
            const character = 0;

            const frame = new StackFrame(
                frameNumber,
                frameName,
                source,
                line,
                character);

            frames.push(frame);
        }

        response.body = {
            stackFrames: frames,
            totalFrames: stackframes.length
        };
        this.sendResponse(response);
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        const frameReference = args.frameId;
        const scopes = new Array<Scope>();
        scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));

        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }

    private createVariables() {
        const variables: Array<DebugProtocol.Variable> = [];
        const state = this._debugger.getState();

        // GR8が有効だとしてもGR8はSPに一致するので必要ない
        const gr = [0, 1, 2, 3, 4, 5, 6, 7].map(i => "GR" + i).map(gr => createVariable(gr, state.GR[gr]));
        variables.push(...gr);

        const pr = createVariable("PR", state.PR);
        const sp = createVariable("SP", state.SP);
        const of = createVariable("OF", boolToBin(state.FR.OF));
        const sf = createVariable("SF", boolToBin(state.FR.SF));
        const zf = createVariable("ZF", boolToBin(state.FR.ZF));
        variables.push(pr, sp, of, sf, zf);

        return variables;
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        const variables: Array<DebugProtocol.Variable> = [];
        const state = this._debugger.getState();

        // GR8が有効だとしてもGR8はSPに一致するので必要ない
        const gr = [0, 1, 2, 3, 4, 5, 6, 7].map(i => "GR" + i).map(gr => createVariable(gr, state.GR[gr]));
        variables.push(...gr);

        const pr = createVariable("PR", state.PR);
        const sp = createVariable("SP", state.SP);
        const of = createVariable("OF", boolToBin(state.FR.OF));
        const sf = createVariable("SF", boolToBin(state.FR.SF));
        const zf = createVariable("ZF", boolToBin(state.FR.ZF));
        variables.push(pr, sp, of, sf, zf);

        response.body = { variables: variables };
        this.sendResponse(response);
    }

    // 緑の再生ボタンが押された時
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        let executeLine = this._currentLine;

        while (true) {
            const stepResult = this._debugger.stepInto(executeLine);
            if (stepResult.programEnd) {
                this.sendResponse(response);
                this.sendEvent(new TerminatedEvent());
                return;
            }

            executeLine = stepResult.nextLine;

            if (this.hitBreakPointOrException(response, executeLine)) {
                return;
            }
        }
    }

    // vscodeのStep Overに相当
    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        const inst = this._debugger.getState().nextInstruction!.name;
        if (inst === "CALL") {
            // CALL命令の時は一行だけ実行してブレークポイントなどに
            // 当たらなければ続けてStep Outをすることに相当する
            const executeLine = this._currentLine;
            const stepResult = this._debugger.stepInto(executeLine);

            if (stepResult.programEnd) {
                this.sendResponse(response);
                this.sendEvent(new TerminatedEvent());
                return;
            }

            if (this.hitBreakPointOrException(response, stepResult.nextLine)) {
                return;
            }

            this.stepOutRequest(<DebugProtocol.StepOutResponse>response, { threadId: Comet2DebugSession.THREAD_ID })
        } else {
            // CALL命令でない時はStep Intoと同じ
            this.stepInRequest(<DebugProtocol.StepInResponse>response, { threadId: Comet2DebugSession.THREAD_ID });
        }
    }

    // vscodeのStep Intoに相当
    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        // 一行実行して停止
        const executeLine = this._currentLine;
        const stepResult = this._debugger.stepInto(executeLine);

        if (stepResult.programEnd) {
            this.sendResponse(response);
            this.sendEvent(new TerminatedEvent());
            return;
        }

        this.sendResponse(response);
        // this._currentLineを設定することでストップする位置を知らせる
        this._currentLine = stepResult.nextLine;
        // 停止
        this.sendEvent(new StoppedEvent("step", Comet2DebugSession.THREAD_ID));
    }

    // vscodeのStep Outに相当
    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        const stackFrameDepth = this._debugger.stackFrameCount;

        let executeLine = this._currentLine;
        while (true) {
            const inst = this._debugger.getState().nextInstruction!.name;
            const stepResult = this._debugger.stepInto(executeLine);
            if (stepResult.programEnd) {
                this.sendResponse(response);
                this.sendEvent(new TerminatedEvent());
                return;
            }

            executeLine = stepResult.nextLine;

            if (this.hitBreakPointOrException(response, executeLine)) {
                return;
            }

            // スタックフレームでいう一つしたのフレームに移動したら止める
            const endSubroutine = this._debugger.stackFrameCount == stackFrameDepth - 1;
            if (endSubroutine) {
                this._currentLine = stepResult.nextLine;
                this.sendResponse(response);
                this.sendEvent(new StoppedEvent("step", Comet2DebugSession.THREAD_ID));
                return;
            }
        }
    }

    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        const { context, expression } = args;

        const variables = this.createVariables();
        const variable = variables.find(x => x.name === expression);
        if (variable === undefined) {
            response.success = false;
            response.message = "利用できません。";
            this.sendResponse(response);
            return;
        }

        // repl : vscodeでいうDEBUG CONSOLEで式の評価がリクエストされた場合
        // hover: エディタ上の変数などにホバーされた場合
        if (context === "repl" || context === "hover") {
            response.body = {
                result: variable.value,
                type: variable.type,
                variablesReference: variable.variablesReference
            };
        }

        this.sendResponse(response);
    }

	/**
	 * ブレークポイントや例外が発生したらブレークする
	 */
    private hitBreakPointOrException(response: DebugProtocol.Response, line: number): boolean {
        // 対象のファイルのブレークポイントを取得する
        const breakpoints = this._breakPoints.get(this._sourceFile);

        // ブレークポイントがあれば止める
        if (breakpoints) {
            const bps = breakpoints.filter(bp => bp.line === this.convertDebuggerLineToClient(line));
            if (bps.length > 0) {
                this._currentLine = line;

                this.sendResponse(response);

                this.sendEvent(new StoppedEvent("breakpoint", Comet2DebugSession.THREAD_ID));
                return true;
            }
        }

        const exceptionThrown = false;
        // 例外が発生したら例外としてブレークする
        if (exceptionThrown) {
            this._currentLine = line;
            this.sendResponse(response);
            this.sendEvent(new StoppedEvent("exception", Comet2DebugSession.THREAD_ID));
            return true;
        }

        return false;
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [
                new Thread(Comet2DebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }
}
