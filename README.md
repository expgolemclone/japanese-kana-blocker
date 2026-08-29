# Japanese Kana Blocker

許可したサイト以外でひらがなまたはカタカナを検出したとき, ページ全体を遮断するTampermonkey userscriptです.

## Install

1. Tampermonkeyをインストールします.
2. private repositoryへアクセスできるaccountで[Releases](https://github.com/expgolemclone/japanese-kana-blocker/releases)を開きます.
3. 最新Releaseから`block-japanese-kana.user.js`をdownloadし, Tampermonkeyへインストールします.

## Behavior

- HTTPとHTTPSの全ページを対象にします.
- 初期表示前にDOMを検査し, かなが一瞬表示されることを防ぎます.
- 動的に追加または変更されたテキストも監視します.
- ひらがな, カタカナ, 小書き文字, 長音記号, 半角カナ, 拡張かな文字を検出します.
- 本文に加え, `title`, `alt`, `placeholder`, `aria-label`, ボタンの`value`を検査します.
- `script`, `style`, `noscript`, `template`内と, テキスト入力中の値は検査しません.
- 検出時は元のDOMを削除し, 解除操作のないブロック画面へ置き換えます.

## Allowed sites

次の本体ホストと全サブドメインを許可します.

- `kakomonn.com`
- `chatgpt.com`
- `github.com`
- `amazon.*`
- `aniwaves.*`
- `myna.go.jp`
- `kojinbango-card.go.jp`
- `digital.go.jp`

許可サイトはuserscriptの`@exclude`で管理します.

## Release

Node.js 22.12以上, jj, GitHub CLIを用意し, `gh auth login`を完了してください.
変更をcommitして`main` bookmarkを新しいcommitへ移動した後, repository rootで次を実行します.

```powershell
npm run push
```

このcommandはlocal testを実行し, jjで`main`だけをoriginへpushした後, GitHub Releaseを作成します.
Release tagとuserscriptの`@version`は`v<version>`で一致し, userscript本体をassetとして添付します.
local, origin, GitHub上の`main`が一致しない場合, repositoryがprivateでない場合, または同じversionのReleaseが存在する場合は公開しません.

## Limitations

- ブラウザ内部ページ, 拡張機能ストア, PDFビューアなど, Tampermonkeyが実行できないページは対象外です.
- トップレベルページだけを検査します. クロスオリジンiframe内部は検査しません.
- CSSの疑似要素, canvas内の描画文字, 画像内の文字は検査しません.

## License

[MIT License](LICENSE)
