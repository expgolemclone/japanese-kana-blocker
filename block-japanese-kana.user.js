// ==UserScript==
// @name         Japanese Kana Blocker
// @namespace    https://github.com/expgolemclone/japanese-kana-blocker
// @version      1.3.0
// @description  Blocks pages containing hiragana or katakana outside approved sites.
// @homepageURL  https://github.com/expgolemclone/japanese-kana-blocker
// @supportURL   https://github.com/expgolemclone/japanese-kana-blocker/issues
// @updateURL    https://raw.githubusercontent.com/expgolemclone/japanese-kana-blocker/main/block-japanese-kana.user.js
// @downloadURL  https://raw.githubusercontent.com/expgolemclone/japanese-kana-blocker/main/block-japanese-kana.user.js
// @match        *://*/*
// @exclude      *://amazon.*/*
// @exclude      *://*.amazon.*/*
// @exclude      *://aniwaves.*/*
// @exclude      *://*.aniwaves.*/*
// @exclude      *://kakomonn.com/*
// @exclude      *://*.kakomonn.com/*
// @exclude      *://chatgpt.com/*
// @exclude      *://*.chatgpt.com/*
// @exclude      *://github.com/*
// @exclude      *://*.github.com/*
// @exclude      *://pornhub.com/*
// @exclude      *://*.pornhub.com/*
// @exclude      *://myna.go.jp/*
// @exclude      *://*.myna.go.jp/*
// @exclude      *://kojinbango-card.go.jp/*
// @exclude      *://*.kojinbango-card.go.jp/*
// @exclude      *://digital.go.jp/*
// @exclude      *://*.digital.go.jp/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const KANA_PATTERN = /[\u3041-\u3096\u3099-\u309F\u30A1-\u30FA\u30FC-\u30FF\u31F0-\u31FF\uFF66-\uFF9F\u{1AFF0}-\u{1AFFF}\u{1B000}-\u{1B16F}]/u;
    const EXCLUDED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
    const DISPLAY_TEXT_ATTRIBUTES = ['title', 'alt', 'placeholder', 'aria-label'];
    const DISPLAY_VALUE_INPUT_TYPES = new Set(['button', 'reset', 'submit']);
    const BLOCKED_TITLE = 'Kana Blocked';

    let blocked = false;
    let initialScanFinished = false;

    const cloak = document.createElement('style');
    cloak.dataset.kanaBlockerCloak = '';
    cloak.textContent = 'html { visibility: hidden !important; }';

    function containsKana(value) {
        return typeof value === 'string' && KANA_PATTERN.test(value);
    }

    function isExcludedElement(element) {
        return EXCLUDED_TAGS.has(element.tagName);
    }

    function isInsideExcludedElement(node) {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return element !== null && element.closest('script, style, noscript, template') !== null;
    }

    function elementAttributesContainKana(element) {
        for (const attribute of DISPLAY_TEXT_ATTRIBUTES) {
            if (containsKana(element.getAttribute(attribute))) {
                return true;
            }
        }

        if (element instanceof HTMLInputElement) {
            const inputType = element.type.toLowerCase();
            if (DISPLAY_VALUE_INPUT_TYPES.has(inputType) && containsKana(element.getAttribute('value'))) {
                return true;
            }
        }

        return false;
    }

    function textNodeContainsKana(node) {
        return !isInsideExcludedElement(node) && containsKana(node.nodeValue);
    }

    function subtreeContainsKana(root) {
        if (root.nodeType === Node.TEXT_NODE) {
            return textNodeContainsKana(root);
        }

        if (root.nodeType === Node.ELEMENT_NODE) {
            if (isInsideExcludedElement(root)) {
                return false;
            }

            if (elementAttributesContainKana(root)) {
                return true;
            }
        }

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (node.nodeType === Node.ELEMENT_NODE && isExcludedElement(node)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                },
            },
        );

        let node = walker.nextNode();
        while (node !== null) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (containsKana(node.nodeValue)) {
                    return true;
                }
            } else if (elementAttributesContainKana(node)) {
                return true;
            }

            node = walker.nextNode();
        }

        return false;
    }

    function createBlockedDocument() {
        const head = document.createElement('head');
        const title = document.createElement('title');
        const style = document.createElement('style');
        const body = document.createElement('body');
        const panel = document.createElement('main');
        const heading = document.createElement('h1');
        const reason = document.createElement('p');
        const url = document.createElement('code');

        title.textContent = BLOCKED_TITLE;
        style.textContent = `
            :root {
                color-scheme: dark;
                font-family: system-ui, sans-serif;
            }
            body {
                box-sizing: border-box;
                display: grid;
                min-height: 100vh;
                margin: 0;
                padding: 2rem;
                place-items: center;
                color: #f8fafc;
                background: #0f172a;
            }
            main {
                width: min(42rem, 100%);
                padding: 2rem;
                border: 1px solid #334155;
                border-radius: 0.75rem;
                background: #1e293b;
                box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 35%);
            }
            h1 {
                margin: 0 0 1rem;
                font-size: 1.75rem;
            }
            p {
                margin: 0 0 1rem;
                color: #cbd5e1;
            }
            code {
                display: block;
                overflow-wrap: anywhere;
                color: #fca5a5;
            }
        `;
        heading.textContent = BLOCKED_TITLE;
        reason.textContent = 'This page contains Japanese kana.';
        url.textContent = encodeURI(window.location.href);

        head.append(title, style);
        panel.append(heading, reason, url);
        body.append(panel);

        return { head, body };
    }

    function blockPage() {
        if (blocked) {
            return;
        }

        blocked = true;
        pageObserver.disconnect();
        window.stop();

        const root = document.documentElement ?? document.appendChild(document.createElement('html'));
        const { head, body } = createBlockedDocument();

        for (const attribute of Array.from(root.attributes)) {
            root.removeAttribute(attribute.name);
        }

        root.lang = 'en';
        root.replaceChildren(head, body);
    }

    function attachCloak() {
        if (!blocked && !initialScanFinished && !cloak.isConnected && document.documentElement !== null) {
            document.documentElement.append(cloak);
        }
    }

    function inspectMutation(record) {
        if (record.type === 'characterData') {
            return textNodeContainsKana(record.target);
        }

        if (record.type === 'attributes') {
            return !isInsideExcludedElement(record.target) && elementAttributesContainKana(record.target);
        }

        for (const node of record.addedNodes) {
            if (subtreeContainsKana(node)) {
                return true;
            }
        }

        return false;
    }

    const pageObserver = new MutationObserver((records) => {
        attachCloak();

        for (const record of records) {
            if (inspectMutation(record)) {
                blockPage();
                return;
            }
        }
    });

    pageObserver.observe(document, {
        attributes: true,
        attributeFilter: [...DISPLAY_TEXT_ATTRIBUTES, 'value'],
        characterData: true,
        childList: true,
        subtree: true,
    });

    attachCloak();

    function finishInitialScan() {
        if (blocked) {
            return;
        }

        if (document.documentElement !== null && subtreeContainsKana(document.documentElement)) {
            blockPage();
            return;
        }

        initialScanFinished = true;
        cloak.remove();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', finishInitialScan, { once: true });
    } else {
        finishInitialScan();
    }
})();
