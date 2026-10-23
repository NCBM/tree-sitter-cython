# tree-sitter-cython

[Cython](https://cython.org/) grammar for [tree-sitter](https://tree-sitter.github.io/).

The grammar extends [tree-sitter-python](https://github.com/tree-sitter/tree-sitter-python)
with the Cython-specific syntax: `cdef`/`cpdef`/`ctypedef` declarations, `cimport`,
`extern` blocks, C types and declarators, `cppclass` (including C++ operators and
`const` methods), `fused` types, `struct`/`enum`/`union`, `include` statements,
compile-time `DEF`/`IF`/`ELIF`/`ELSE` directives, Cython `for ... from` loops and the
`<type>` cast, `new` and `sizeof` expressions.

## Supported file types

`.pyx`, `.pxd`, `.pxi`

## Development

```sh
pdm install          # set up the dev environment
tree-sitter generate # regenerate src/parser.c from grammar.js
tree-sitter test     # run the corpus tests in test/corpus
tree-sitter parse some_file.pyx
```

## License

MIT
