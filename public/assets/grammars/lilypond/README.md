# LilyPond grammar

Not included in this repository. The grammar comes from
[jeandeaual/vscode-lilypond-syntax](https://github.com/jeandeaual/vscode-lilypond-syntax)
and is licensed CC BY-NC 3.0, which is incompatible with AGPL-3.0-or-later.

To download it, from the repository root:

```sh
node scripts/download-grammars.cjs --include-optional
```

The downloaded files are gitignored. CC BY-NC permits non-commercial use with
attribution, so they must not be committed or included in a commercial
deployment.

Until the grammar is present, `.ly` and `.ily` files have no highlighting.
