/**
 * @file Cython syntax parser for TreeSitter
 * @author NCBM <worldmozara@163.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @return {SeqRule}
 */
function commaSep1(rule) {
  return sep1(rule, ",");
}

/**
 * Creates a rule to match one or more of the rules separated by the separator
 *
 * @param {Rule} rule
 * @param {string} separator - The separator to use.
 *
 * @return {SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

import Python from "tree-sitter-python/grammar.js";

const PREC = Object.assign({}, Python.PREC, {
  keyword_identifier: -3,
  c_type: 1,
  gil_spec_exception_value: 1,
  new: 23,
  cast: 24,
  lambda_parameters: 25,
});


export default grammar(Python, {
  name: "cython",

  conflicts: ($, original) =>
    original.concat([
      [$.maybe_typed_name],
      [$.c_name, $.cvar_decl],
      [$.c_type],
      [$.argument_list, $.function_pointer_type],
      [$.maybe_typed_name, $.py_typedargument],
      // `*args` / `**kwargs` versus a pointer qualifier in a C declarator,
      // and a function pointer type versus a C parameter list.
      [$.varargs_parameter, $.type_qualifier],
      [$.kwargs_parameter, $.type_qualifier],
      [$.function_pointer_type, $.c_parameters],
      // `operator` is both a C++ operator name and a legal parameter name;
      // `operator ,` makes `cdef foo operator, x` genuinely ambiguous.
      [$.operator_name, $.maybe_typed_name],
      [$.operator_name, $.type_qualifier],
    ]),

  rules: {
    module: $ => seq(optional($.run_directive), repeat($._statement)),

    run_directive: $ => seq("PYTHON", /[^\r\n]+/, $._newline),

    c_integer_signedness: $ =>
      /[uU]/,

    c_integer_type: $ => choice(
      seq(
        optional($.c_integer_signedness),
        /[lL]/,
        optional(/[lL]/),
      ),
      $.c_integer_signedness,
    ),

    integer: $ => choice(
      seq(
        choice("0x", "0X"),
        repeat1(/_?[A-Fa-f0-9]+/),
        optional($.c_integer_type),
      ),
      seq(
        choice("0o", "0O"),
        repeat1(/_?[0-7]+/),
        optional($.c_integer_type),
      ),
      seq(
        choice("0b", "0B"),
        repeat1(/_?[0-1]+/),
        optional($.c_integer_type),
      ),
      seq(
        repeat1(/[0-9]+_?/),
        choice(
          optional($.c_integer_type), // long numbers
          optional(/[jJ]/), // complex numbers
        ),
      ),
    ),

    // Cython allows 'cimport'
    import_statement: $ =>
      seq(
        choice("import", "cimport"),
        $._import_list,
      ),

    import_from_statement: $ =>
      seq(
        "from",
        field(
          "module_name",
          choice(
            $.relative_import,
            $.dotted_name,
          ),
        ),
        choice("import", "cimport"),
        choice(
          $.wildcard_import,
          $._import_list,
          seq("(", $._import_list, ")"),
        ),
      ),

    class_definition: $ =>
      seq(
        repeat($.storageclass),
        "class",
        field("name", $.identifier),
        repeat(seq(".", $.identifier)),
        choice(
          field("name_specification", $.external_definition),
          seq(
            field("superclasses", optional($.argument_list)),
            field("name_specification", optional($.external_definition)),
            ":",
            field("body", $._suite),
          ),
          $._newline,
        ),
      ),
    external_definition: $ =>
      seq(
        "[",
        commaSep1(seq(choice("object", "type"), $.c_type)),
        "]",
      ),

    property_definition: $ =>
      seq(
        "property",
        $.identifier,
        ":",
        field("body", $._suite),
      ),

    include_statement: $ =>
      seq(
        "include",
        choice(
          $.string,
          seq("<", $.string, ">"),
        ),
      ),

    _simple_statement: ($, original) =>
      choice(
        original,
        $.include_statement,
      ),

    _compound_statement: ($, original) =>
      choice(
        original,
        $.DEF_statement,
        $.IF_statement,
        $.cdef_statement,
        $.ctypedef_statement,
        $.property_definition,
      ),

    decorated_definition: $ =>
      seq(
        repeat1($.decorator),
        field(
          "definition",
          choice(
            $.class_definition,
            $.function_definition,
            $.cdef_statement,
          ),
        ),
      ),

    DEF_statement: $ =>
      seq(
        "DEF",
        field("name", $.identifier),
        "=",
        $.expression,
        $._newline,
      ),

    IF_statement: $ => seq(
      "IF",
      field("condition", $.expression),
      ":",
      field("consequence", $._suite),
      repeat(field("alternative", $.ELIF_clause)),
      optional(field("alternative", $.ELSE_clause)),
    ),

    ELIF_clause: $ => seq(
      "ELIF",
      field("condition", $.expression),
      ":",
      field("consequence", $._suite),
    ),

    ELSE_clause: $ => seq(
      "ELSE",
      ":",
      field("body", $._suite),
    ),

    cdef_statement: $ =>
      seq(
        choice("cdef", "cpdef"),
        choice(
          $.cvar_def,
          $.cdef_type_declaration,
          $.extern_block,
          $.cdef_definition_block,
        ),
      ),

    cdef_definition_block: $ =>
      seq(
        repeat($.storageclass),
        optional(choice($.identifier, $.keyword_identifier)),
        ":",
        $._indent,
        repeat1(choice($.cvar_def, $.ctypedef_statement, $.cdef_type_declaration, $.extern_block)),
        $._dedent,
      ),

    cvar_def: $ =>
      seq(
        repeat($.storageclass),
        $.maybe_typed_name,
        choice(
          seq(
            optional(seq("=", $.expression)),
            repeat(seq(
              ",",
              optional($.type_qualifier),
              $.identifier,
              optional(seq("=", $.expression)),
            )),
            optional(","),
            $._newline,
          ),
          $.c_function_definition,
        ),
      ),

    cdef_type_declaration: $ => choice($.ctype_declaration, $.fused, $.class_definition),

    extern_block: $ =>
      seq(
        "extern",
        optional(seq(
          "from",
          choice($.string, "*"),
          optional(seq("namespace", $.string)),
          optional("nogil"),
        )),
        choice(
          seq(":", $.extern_suite),
          $.class_definition,
          $.cvar_def,
        ),
      ),

    extern_suite: $ =>
      choice(
        $.pass_statement,
        seq(
          $._indent,
          choice(
            repeat1(choice(
              seq(
                optional(choice("cdef", "cpdef")),
                choice($.cvar_decl, $.cdef_type_declaration),
              ),
              $.ctypedef_statement,
              $.string,
            )),
            $.pass_statement,
          ),
          $._dedent,
        ),
        alias($._newline, $.block),
      ),

    ctype_declaration: $ => choice($.struct, $.enum, $.cppclass),

    cvar_decl: $ =>
      seq(
        repeat($.storageclass),
        $.c_type,
        optional(seq($.c_name, optional(field("alias", $.string)))),
        choice(
          seq(
            $.identifier,
            optional(field("alias", $.string)),
            repeat($.type_index),
            optional(seq("=", $.expression)),
            repeat(seq(
              ",",
              $.identifier,
              optional(field("alias", $.string)),
              optional(seq("=", $.expression)),
            )),
            $._newline,
          ),
          $.c_function_definition,
        ),
      ),

    int_type: $ =>
      prec.right(choice(
        seq(
          $._signedness,
          optional($._longness),
        ),
        $._longness,
        seq(
          optional($._signedness),
          optional($._longness),
          choice("int", "double"),
        ),
        "complex",
      )),

    operator_name: $ =>
      seq(
        "operator",
        choice(
          "co_await",
          "+",
          "-",
          "*",
          "/",
          "%",
          "^",
          "&",
          "|",
          "~",
          "!",
          "=",
          "<",
          ">",
          "+=",
          "-=",
          "*=",
          "/=",
          "%=",
          "^=",
          "&=",
          "|=",
          "<<",
          ">>",
          ">>=",
          "<<=",
          "==",
          "!=",
          "<=",
          ">=",
          "<=>",
          "&&",
          "||",
          "++",
          "--",
          ",",
          "->*",
          "->",
          "()",
          "[]",
          "xor",
          "bitand",
          "bitor",
          "compl",
          "not",
          "xor_eq",
          "and_eq",
          "or_eq",
          "not_eq",
          "and",
          "or",
          seq(choice("new", "delete"), optional("[]")),
          seq("\"\"", $.identifier),
          // Cython only supports the conversion operator to `bool`, see
          // `supported_overloaded_operators` in its parser.
          alias("bool", $.identifier),
        ),
      ),

    _signedness: _ => choice("signed", "unsigned"),
    _longness: _ =>
      prec.right(choice(
        "char",
        "short",
        "long",
        alias(seq("long", "long"), "long long"),
      )),

    function_pointer_type: $ =>
      seq(
        $.c_type,
        "(",
        optional(commaSep1($.c_type)),
        ")",
        optional($.exception_value),
        optional($.gil_spec),
      ),

    // type: ['const'] (NAME ('.' PY_NAME)* | int_type | '(' type ')') ['complex'] [type_qualifier]
    c_type: $ =>
      prec.right(
        PREC.c_type,
        seq(
          optional(choice("const", "volatile")),
          choice(
            seq(
              field("type", $.identifier),
              repeat(seq(
                ".",
                $.identifier,
              )),
            ),
            $.int_type,
            seq("(", $.c_type, ")"),
            $.function_pointer_type, // Included here
          ),
          optional("complex"),
          repeat($.type_qualifier),
        ),
      ),

    c_name: $ =>
      choice(
        seq(optional($.type_qualifier), $.identifier),
        seq("(", optional($.type_qualifier), $.identifier, ")"),
      ),

    maybe_typed_name: $ =>
      choice(
        seq(
          optional(choice("const", "volatile")),
          // Cython's grammar for `maybe_typed_name` allows a parenthesised
          // type here, which is how `cdef (PyObject*) x = NULL` parses.
          field("type", choice($.identifier, $.keyword_identifier, $.int_type, seq("(", $.c_type, ")"))),
          optional(seq(
            repeat(seq(
              ".",
              $.identifier,
            )),
            optional("complex"),
            repeat($.type_qualifier),
          )),
          field("name", optional(choice($.identifier, $.keyword_identifier, $.operator_name, $.c_function_pointer_name))),
          optional(field("alias", $.string)),
          repeat($.type_qualifier),
        ),
        seq(
          optional(choice("const", "volatile")),
          field("name", choice($.identifier, $.keyword_identifier, $.operator_name)),
          optional(field("alias", $.string)),
          repeat($.type_qualifier),
        ),
      ),

    c_function_pointer_name: $ =>
      seq("(", "*", field("name", $.identifier), ")"),

    // type_qualifier: '*' | '**' | '&' | type_index ('.' NAME [type_index])*
    type_qualifier: $ =>
      choice(
        "*",
        "**",
        "&",
        "__stdcall",
        seq(
          $.type_index,
          repeat(seq(
            ".",
            $.identifier,
            optional($.type_index),
          )),
        ),
      ),

    type_index: $ =>
      seq(
        "[",
        optional(choice(
          $.integer,
          commaSep1(seq(choice($.c_function_argument_type, $.c_type), optional(seq("=", $.expression)))),
          commaSep1($.memory_view_index),
        )),
        "]",
      ),
    memory_view_index: $ =>
      seq(
        ":",
        optional($.expression),
        optional(seq(
          ":",
          optional($.expression),
        )),
      ),

    ctypedef_statement: $ =>
      seq(
        repeat($.storageclass),
        "ctypedef",
        choice($.cvar_decl, $.struct, $.enum, $.fused, $.class_definition, $.extern_block),
        optional(";"),
      ),

    c_function_declaration: $ =>
      seq(
        optional($.template_params),
        $.c_parameters,
        optional($.gil_spec),
        optional($.exception_value),
        optional($.gil_spec),
      ),

    c_function_definition: $ =>
      seq(
        optional($.template_params),
        $.c_parameters,
        optional($.gil_spec),
        optional($.exception_value),
        optional($.gil_spec),
        optional($.const_method),
        choice(
          seq(":", $._suite),
          $._newline,
        ),
      ),

    // Cython only accepts a trailing `const` qualifier inside a cppclass:
    //     T& get() const
    const_method: _ => "const",

    template_default: $ =>
      seq("=", "*"),

    template_param: $ =>
      seq($.identifier, optional($.template_default)),

    template_params: $ =>
      seq(
        "[",
        commaSep1($.template_param),
        "]",
      ),

    lambda_parameters: $ =>
      prec.right(
        PREC.lambda_parameters,
        choice(
          $.identifier,
          $.tuple_pattern,
          $._parameters,
        ),
      ),

    lambda: $ =>
      prec(
        PREC.lambda,
        seq(
          "lambda",
          field("parameters", optional($.lambda_parameters)),
          ":",
          field("body", $.expression),
        ),
      ),

    // Parameter lists.  Cython's `typedargslist` is a single list that mixes
    // Python-style arguments (`x: int = 1`, `*args`, `**kwargs`) with C-style
    // typed arguments (`int x`, `char *buf`) and allows a trailing `...`.
    parameters: $ =>
      seq(
        "(",
        optional($._typedargslist),
        ")",
      ),

    // A Python-style annotated argument, e.g. `x: int = 1`.  A bare name or a
    // C-style typed argument is handled by `_typedargument`, which keeps the
    // two spellings unambiguous.
    py_typedargument: $ =>
      seq(
        $.identifier,
        ":",
        field("type", $.expression),
        optional(seq("=", field("value", $.expression))),
        optional(seq("not", "None")),
      ),

    // Cython/C-style parameter list (the type is a `c_type`).
    c_parameters: $ =>
      seq(
        "(",
        optional($._typedargslist),
        ")",
      ),

    // e.g.
    // int (*)(const char, int)
    // int (*func)(const char, int)
    // void (*)() noexcept nogil
    c_function_argument_type: $ =>
      seq(
        $.c_type,
        "(",
        "*",
        optional($.identifier),
        ")",
        $.c_parameters,
        optional($.exception_value),
        optional($.gil_spec),
      ),

    _typedargument: $ =>
      seq(
        $.maybe_typed_name,
        optional(seq(":", $.c_type)),
        optional(seq("=", choice($.expression, "*"))),
        optional(seq("not", "None")),
      ),

    // A single argument: either Python-style (`*args`, `**kwargs`, a defaulted
    // argument) or a Cython/C-style typed argument.
    _argument: $ =>
      choice(
        $._typedargument,
        $.c_function_argument_type,
        $.tuple_pattern,
        $.py_typedargument,
        $.varargs_parameter,
        $.kwargs_parameter,
        $.keyword_separator,
        $.positional_separator,
      ),

    varargs_parameter: $ =>
      seq(
        "*",
        $.identifier,
        optional(seq(":", field("type", $.expression))),
      ),

    kwargs_parameter: $ =>
      seq(
        "**",
        $.identifier,
        optional(seq(":", field("type", $.expression))),
      ),

    _typedargslist: $ =>
      choice(
        "...",
        seq(
          commaSep1($._argument),
          optional(seq(",", "...")),
          optional(","),
        ),
      ),

    gil_spec: _ => choice(seq("with", choice("gil", "nogil")), "nogil"),
    exception_value: $ =>
      choice(
        prec(
          PREC.gil_spec_exception_value,
          seq(
            "except",
            choice(
              seq(optional("?"), $.expression),
              // `except *` rechecks the error indicator, `except +` reports the
              // C++ exception. `except +*` does both and `except +<PyErr>` uses
              // the given function to fetch the exception value.
              seq(
                "+",
                optional(choice("*", $.identifier)),
              ),
              "*",
            ),
          ),
        ),
        "noexcept",
      ),

    typed_parameter: $ =>
      prec(
        PREC.typed_parameter,
        choice(
          seq(
            field("type", $.c_type),
            choice(
              seq($.identifier, optional($.type_index)),
              $.list_splat_pattern,
              $.dictionary_splat_pattern,
            ),
            optional(seq(
              choice("not", "or"),
              "None",
            )),
          ),
          seq(
            choice(
              $.identifier,
              $.list_splat_pattern,
              $.dictionary_splat_pattern,
            ),
            ":",
            // A Python annotation may be a C type, a string forward
            // reference, or a general expression such as `int | slice`.
            field("type", choice($.c_type, $.string, $.expression)),
          ),
        ),
      ),

    typed_default_parameter: $ =>
      prec(
        PREC.typed_parameter,
        seq(
          field("type", $.c_type),
          field("name", $.identifier),
          optional($.type_index),
          "=",
          field("value", $.expression),
        ),
      ),

    struct: $ =>
      seq(
        repeat($.storageclass),
        choice("struct", "union"),
        $.identifier,
        optional(field("alias", $.string)),
        choice($._newline, seq(":", $.struct_suite)),
      ),
    struct_suite: $ =>
      choice(
        $.pass_statement,
        seq(
          $._indent,
          choice(
            repeat($.cvar_decl),
            $.pass_statement,
          ),
          $._dedent,
        ),
        alias($._newline, $.block),
      ),

    enum: $ =>
      seq(
        repeat($.storageclass),
        "enum",
        optional(choice("class", "struct")),
        optional(
          seq(
            $.identifier,
            optional(seq("(", $.c_type, ")")),
            optional(seq(":", $.c_type)),
          ),
        ),
        choice($._newline, seq(":", $._suite)),
      ),

    cppclass: $ =>
      seq(
        "cppclass",
        $.identifier,
        optional(field("alias", $.string)),
        optional($.template_params),
        optional($.cppclass_bases),
        optional("nogil"),
        choice($._newline, seq(":", $._cppclass_suite)),
      ),

    // cppclass_bases: '(' dotted_PY_NAME (',' dotted_PY_NAME [template_params])* ')'
    cppclass_bases: $ =>
      seq(
        "(",
        commaSep1(seq($.dotted_name, optional($.template_params))),
        ")",
      ),

    _cppclass_suite: $ =>
      choice(
        $.pass_statement,
        seq(
          $._indent,
          repeat($._cppclass_member),
          $._dedent,
        ),
      ),

    // Cython permits decorators (e.g. `@staticmethod`) on cppclass members.
    _cppclass_member: $ =>
      seq(
        repeat($.decorator),
        choice(
          $.ctypedef_statement,
          $.cvar_def,
          $.cppclass,
        ),
      ),

    fused: $ =>
      seq(
        "fused",
        $.identifier,
        ":",
        $._indent,
        repeat(seq(
          $.c_type,
          $._newline,
        )),
        $._dedent,
      ),

    storageclass: _ => choice("public", "packed", "inline", "api", "readonly"),

    expression: ($, original) =>
      choice(
        original,
        $.new_expression,
      ),

    primary_expression: ($, original) =>
      choice(
        original,
        $.cast_expression,
        $.sizeof_expression,
      ),

    new_expression: $ =>
      prec(
        PREC.new,
        seq(
          "new",
          $.c_type,
          $.argument_list,
        ),
      ),

    sizeof_expression: $ =>
      prec(
        PREC.new,
        seq(
          "sizeof",
          "(",
          choice($.c_function_argument_type, $.c_type, $.expression),
          ")",
        ),
      ),

    cast_expression: $ =>
      prec(
        PREC.cast,
        seq(
          "<",
          $.c_type,
          optional("?"),
          ">",
          $.expression,
        ),
      ),

    unary_operator: $ =>
      prec(
        PREC.unary,
        seq(
          field("operator", choice("+", "-", "~", "&")),
          field("argument", $.primary_expression),
        ),
      ),

    _comprehension_for_clause: $ =>
      choice($.for_in_clause,
        seq(optional("async"),
          "for",
          $.for_from_loop),
      ),

    _comprehension_clauses: $ => seq(
      $._comprehension_for_clause,
      repeat(choice(
        $._comprehension_for_clause,
        $.if_clause,
      )),
    ),

    for_in_loop: $ =>
      seq(
        field("left", $._left_hand_side),
        "in",
        field("right", commaSep1($._expression_within_for_in_clause)),
      ),

    for_from_relation: $ =>
      choice("<", "<=", ">", ">="),

    for_from_loop: $ =>
      seq(
        optional(
          seq(
            field("left", $.identifier),
            "from",
          ),
        ),
        field("lower", choice($.primary_expression)),
        $.for_from_relation,
        field("var", $.identifier),
        $.for_from_relation,
        field("upper", choice($.primary_expression)),
        optional(seq(
          "by",
          $._expressions,
        )),
      ),

    for_statement: $ =>
      seq(
        optional("async"),
        "for",
        choice($.for_from_loop, $.for_in_loop),
        ":",
        field("body", $._suite),
        field("alternative", optional($.else_clause)),
      ),
    keyword_identifier: $ =>
      choice(
        prec(
          PREC.keyword_identifier,
          alias(
            choice(
              "print",
              "exec",
              "async",
              "await",
              "api",
            ),
            $.identifier,
          ),
        ),
        // Soft keywords: ordinary names unless they introduce a statement.
        alias(
          choice("type", "match", "operator"),
          $.identifier,
        ),
      ),
  },
});
