<p align="center">
  <img src="http://i.imgur.com/QYRVPcx.png" width="200" alt="vscode-casl2-comet2-icon"/>
</p>
<p align="center">
    CASL2/COMET2 support for <a href="https://code.visualstudio.com/">Visual Studio Code</a>
</p>

<p align="center">
  <img src="http://i.imgur.com/cSRkE0O.gif" alt="Demo"/>
</p>

## Install
Visual Studio CodeのQuick Openを開き(Ctrl+P)，
次のコマンドを入力してEnterを押してください。
 ```
 ext install vscode-casl2-comet2
 ```


## Features
- コード補完(Completion)
- 定義へ移動(Go to Definition)
- すべての参照の検索(Find All References)
- ドキュメントの強調表示(Document Highlight)
- 名前変更(Rename)
- ファイル内のシンボルへ移動(Go to Symbol in File)
- ホバー(Hover)
- 命令のシグネチャ情報表示(Signature Help)
- コード アクション(Code Action)
- コード整形(Document Formatting)
- ブレークポイント(Breakpoints)
- ステップ オーバー(Step Over)
- ステップ イン(Step In)
- ステップ アウト(Step Out)
- コール スタック(Call Stack)


## Settings

### Debugger Settings
`.vscode/launch.json`で
以下のデバッグ実行オプションを設定することができます。

|  設定 | 説明 |
|  ------ | ------ |
|  program | 実行するCASL2プログラム。 |
|  stopOnEntry | プログラム開始直後にブレークします。 |
|  commonOptions | CASL2とCOMET2の共通のオプション。 |
|  casl2Options | CASL2のオプション |
|  comet2Options | COMET2のオプション |


### Language Settings
ユーザー設定またはワークスペース設定(`settings.json`)で
以下の言語オプションを設定することができます。

|  設定 | 説明 |
|  ------ | ------ |
|  `casl2.useGR8` | GR8を有効な汎用レジスタとして使用します。 |
|  `casl2.enableLabelScope` | ラベルのスコープを有効にします。 |
|  `casl2.allowNegativeValueForEffectiveAddress` | 実効アドレスに負値をとることを許可します。 |
|  `casl2.linter.enabled` | Lint機能を有効にします。 |


## Author
[Maxfield Walker](https://github.com/MaxfieldWalker)

## License
MIT

## Credits

### Extension icon
<div>Icons made by <a href="http://www.flaticon.com/authors/madebyoliver" title="Madebyoliver">Madebyoliver</a> from <a href="http://www.flaticon.com" title="Flaticon">www.flaticon.com</a> is licensed by <a href="http://creativecommons.org/licenses/by/3.0/" title="Creative Commons BY 3.0" target="_blank">CC 3.0 BY</a></div>
