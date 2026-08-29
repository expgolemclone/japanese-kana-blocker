# Japanese Kana Blocker

許可したサイト以外でひらがなまたはカタカナを検出したとき, ページ全体を遮断するTampermonkey userscriptです.

## Install

1. Tampermonkeyをインストールします.
2. [block-japanese-kana.user.js](https://raw.githubusercontent.com/expgolemclone/japanese-kana-blocker/main/block-japanese-kana.user.js)を開きます.
3. Tampermonkeyのインストール画面でインストールします.

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
- `myna.go.jp`
- `kojinbango-card.go.jp`
- `digital.go.jp`

許可サイトはuserscriptの`@exclude`で管理します.

## Limitations

- ブラウザ内部ページ, 拡張機能ストア, PDFビューアなど, Tampermonkeyが実行できないページは対象外です.
- トップレベルページだけを検査します. クロスオリジンiframe内部は検査しません.
- CSSの疑似要素, canvas内の描画文字, 画像内の文字は検査しません.

## License

[MIT License](LICENSE)
