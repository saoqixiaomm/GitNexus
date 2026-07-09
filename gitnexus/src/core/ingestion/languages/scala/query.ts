import Parser from 'tree-sitter';
import { SupportedLanguages } from 'gitnexus-shared';
import { getLanguageGrammar } from '../../../tree-sitter/parser-loader.js';

const SCALA_SCOPE_QUERY = `
;; Scopes
(compilation_unit) @scope.module
(class_definition) @scope.class
(trait_definition) @scope.class
(object_definition) @scope.class
(enum_definition) @scope.class
(function_definition) @scope.function
(function_declaration) @scope.function

;; Declarations
(class_definition
  name: (identifier) @declaration.name) @declaration.class
(trait_definition
  name: (identifier) @declaration.name) @declaration.interface
(object_definition
  name: (identifier) @declaration.name) @declaration.class
(enum_definition
  name: (identifier) @declaration.name) @declaration.enum
(function_definition
  name: (identifier) @declaration.name) @declaration.function
(function_declaration
  name: (identifier) @declaration.name) @declaration.function
(val_definition
  pattern: (identifier) @declaration.name) @declaration.property
(var_definition
  pattern: (identifier) @declaration.name) @declaration.property

;; Imports
(import_declaration) @import.statement

;; Type bindings
(parameter
  (identifier) @type-binding.name
  [(type_identifier) (generic_type)] @type-binding.type) @type-binding.parameter
(class_parameter
  (identifier) @type-binding.name
  [(type_identifier) (generic_type)] @type-binding.type) @type-binding.parameter
(val_definition
  (identifier) @type-binding.name
  [(type_identifier) (generic_type)] @type-binding.type) @type-binding.annotation
(var_definition
  (identifier) @type-binding.name
  [(type_identifier) (generic_type)] @type-binding.type) @type-binding.annotation
(function_definition
  name: (identifier) @type-binding.name
  [(type_identifier) (generic_type)] @type-binding.type) @type-binding.return
(function_declaration
  name: (identifier) @type-binding.name
  [(type_identifier) (generic_type)] @type-binding.type) @type-binding.return

;; Calls
(call_expression
  function: (identifier) @reference.name) @reference.call.free
(call_expression
  function: (field_expression
    value: (_) @reference.receiver
    field: (identifier) @reference.name)) @reference.call.member
(call_expression
  function: (generic_function
    function: (identifier) @reference.name)) @reference.call.free
(call_expression
  function: (generic_function
    function: (field_expression
      value: (_) @reference.receiver
      field: (identifier) @reference.name))) @reference.call.member
(instance_expression
  (type_identifier) @reference.name) @reference.call.constructor
`;

let parser: Parser | null = null;
let scopeQuery: Parser.Query | null = null;

export function getScalaParser(): Parser {
  if (parser === null) {
    parser = new Parser();
    parser.setLanguage(getLanguageGrammar(SupportedLanguages.Scala));
  }
  return parser;
}

export function getScalaScopeQuery(): Parser.Query {
  if (scopeQuery === null) {
    scopeQuery = new Parser.Query(getLanguageGrammar(SupportedLanguages.Scala), SCALA_SCOPE_QUERY);
  }
  return scopeQuery;
}
