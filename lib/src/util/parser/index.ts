import { parse_col_id_format } from '../cell_id'

import type { AST } from '../../types/AST'

import nearley from 'nearley'

import { raw_excel_grammar, raw_string_grammar } from './grammars.js'
import type { CellId } from '../../types/Spreadsheet'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore(2345): this is a bug in nearley or moo (the tokenizer); there is a [github issue](https://github.com/kach/nearley/issues/527) for it with a really really hacky solution. // TODO: has this been fixed yet?
const excel_grammar = nearley.Grammar.fromCompiled(raw_excel_grammar)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore(2345): this is a bug in nearley or moo (the tokenizer); there is a [github issue](https://github.com/kach/nearley/issues/527) for it with a really really hacky solution. // TODO: has this been fixed yet?
const string_grammar = nearley.Grammar.fromCompiled(raw_string_grammar)

const parse = (input: string) => {
  const parser = new nearley.Parser(excel_grammar)
  parser.feed(input)
  return parser.finish()
}

const parse_string = (str: string) => {
  const string_parser = new nearley.Parser(string_grammar)
  string_parser.feed(str)
  return string_parser.finish()
}

// eslint-disable-next-line @typescript-eslint/no-use-before-define
const _compile_binary_operator = (op: string, [fst, snd]: [AST, AST]): string => `${compile_inner(fst)} ${op} ${compile_inner(snd)}`

// eslint-disable-next-line @typescript-eslint/no-use-before-define
const _compile_unary_operator = (op: string, fst: AST): string => `${op}${compile_inner(fst)}`

const compile = (ast: AST[]): { fn: any, refs: CellId[] } | null => {
  // I know this is not considered good code, but using eval is pretty much the only choice here,
  // the other choice would be to completely interpret the ast everytime which is also not good
  // for performance reasons, better to just transpile to javascript once and be done with it.
  // As the code is generated from an AST which is generated by a DSL the chance of somehow getting
  // malicious code running through this is *not that high*.
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const transpiled_code = `(g, lib) => ${compile_inner(ast[0])}`
  try {
    /* eslint-disable-next-line */
    return { fn: window.eval(transpiled_code), refs: get_refs(ast[0]) }
  } catch (e) {
    console.error(transpiled_code, e)
    return null
  }
}

const transpile = (input: string) => compile(parse(input))

const get_refs = (ast: AST): CellId[] => {
  switch (ast.type) {
    case 'lambda': {
      return get_refs(ast.val)
    }
    case 'call': {
      const args = ast.val.type === 'list' ? ast.val.val : [ast.val]
      if (ast.fn === 'if' && args.length === 2) {
        return [...get_refs(args[0]), ...get_refs(args[1])]
      } else if (ast.fn === 'if' && args.length === 3) {
        return [...get_refs(args[0]), ...get_refs(args[1]), ...get_refs(args[2])]
      } else if (ast.fn === 'if') {
        throw Error('Syntax error')
      } else {
        return args.map(get_refs).flat(1)
      }
    }
    case 'or':
    case 'and':
    case 'inequality':
    case 'equality':
    case 'greater_than':
    case 'less_than':
    case 'greater_than_or_equal':
    case 'less_than_or_equal':
    case 'subtraction':
    case 'addition':
    case 'multiplication':
    case 'division':
    case 'modulo':
    case 'power': {
      return [...get_refs(ast.val[0]), ...get_refs(ast.val[1])]
    }
    case 'unary_negation':
    case 'unary_plus':
    case 'unary_minus': {
      return get_refs(ast.val)
    }
    case 'range': {
      const x1 = parse_col_id_format(ast.val[0].val[0])
      const x2 = parse_col_id_format(ast.val[1].val[0])
      const y1 = ast.val[0].val[1] - 1
      const y2 = ast.val[1].val[1] - 1

      const tlx = Math.min(x1, x2) // top-left
      const tly = Math.min(y1, y2)
      const brx = Math.max(x1, x2) // bottom-right
      const bry = Math.max(y1, y2)

      const refs: CellId[] = []

      for (let row = tly; row <= bry; row++) {
        for (let col = tlx; col <= brx; col++) {
          refs.push([row, col])
        }
      }

      return refs
    }
    case 'parenthesis': {
      return get_refs(ast.val)
    }
    case 'boolean':
    case 'number':
    case 'string': return []
    case 'it_identifier':
    case 'identifier': {
      switch (ast.val.toLowerCase()) {
        case 'pi': return []
        case 'e': return []
        case 'it': return []
        default: return [ast.val]
      }
    }
    case 'cell': {
      return [[ast.val[1] - 1, parse_col_id_format(ast.val[0])]]
    }
    default: {
      console.log(ast)
      throw new Error('Invalid type error')
    }
  }
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore(2366): the switch statement covers all possible scenarios; this not being detected is likely just a typescript bug
const compile_inner = (ast: AST): string => {
  switch (ast.type) {
    case 'lambda': {
      return `it => ${compile_inner(ast.val)}`
    }
    case 'call': {
      const args = ast.val.type === 'list' ? ast.val.val : [ast.val]
      if (ast.fn === 'if' && args.length === 2) {
        return `((${compile_inner(args[0])}) ? ${compile_inner(args[1])} : undefined)`
      } else if (ast.fn === 'if' && args.length === 3) {
        return `((${compile_inner(args[0])}) ? ${compile_inner(args[1])} : ${compile_inner(args[2])})`
      } else if (ast.fn === 'if') {
        // TODO: somehow do error reporting, maybe by just throwing an error inside the later eval'ed code
        return `throw Error('Syntax error')`
      } else {
        return `lib.${ast.fn}(${args.map(compile_inner).join(', ')})`
      }
    }

    /* eslint-disable no-multi-spaces */
    case 'or':                    return _compile_binary_operator('||', ast.val)
    case 'and':                   return _compile_binary_operator('&&', ast.val)
    case 'inequality':            return _compile_binary_operator('!==', ast.val)
    case 'equality':              return _compile_binary_operator('===', ast.val)
    case 'greater_than':          return _compile_binary_operator('>', ast.val)
    case 'less_than':             return _compile_binary_operator('<', ast.val)
    case 'greater_than_or_equal': return _compile_binary_operator('>=', ast.val)
    case 'less_than_or_equal':    return _compile_binary_operator('<=', ast.val)
    case 'subtraction':           return _compile_binary_operator('-', ast.val)
    case 'addition':              return _compile_binary_operator('+', ast.val)
    case 'multiplication':        return _compile_binary_operator('*', ast.val)
    case 'division':              return _compile_binary_operator('/', ast.val)
    case 'modulo':                return _compile_binary_operator('%', ast.val)
    case 'power':                 return `lib.pow(${ast.val[0].val}, ${ast.val[1].val})`

    case 'unary_negation':        return _compile_unary_operator('!', ast.val)
    case 'unary_plus':            return _compile_unary_operator('+', ast.val)
    case 'unary_minus':           return _compile_unary_operator('-', ast.val)
    /* eslint-enable no-multi-spaces */

    case 'range': {
      const x1 = parse_col_id_format(ast.val[0].val[0])
      const x2 = parse_col_id_format(ast.val[1].val[0])
      const y1 = ast.val[0].val[1] - 1
      const y2 = ast.val[1].val[1] - 1

      const tlx = Math.min(x1, x2) // top-left
      const tly = Math.min(y1, y2)
      const brx = Math.max(x1, x2) // bottom-right
      const bry = Math.max(y1, y2)

      const results = []

      for (let row = tly; row <= bry; row++) {
        for (let col = tlx; col <= brx; col++) {
          results.push(`g('${row}.${col}')`) // TODO: this might need to change when `g` changes
        }
      }

      return `[${results.join(', ')}]`
    }

    case 'parenthesis': return `(${compile_inner(ast.val)})`

    case 'boolean': return ast.val
    case 'number': return ast.val
    case 'string': {
      const str = parse_string(ast.val)[0]
      // what is returned is interpreted as javascript, meaning that it needs enclosing quotes
      // in order to pass as a valid string, this ensures that the right quotes are picked.
      if (ast.sub_type === 'dqstring') return `"${str}"`
      if (ast.sub_type === 'sqstring') return `'${str}'`
    } break
    case 'it_identifier': {
      return `it`
    }
    case 'identifier': {
      switch (ast.val.toLowerCase()) {
        case 'pi': return `lib.pi`
        case 'e': return `lib.e`
        default: return `g('${ast.val}')` // TODO: this might need to change when `g` changes
      }
    }
    case 'cell': {
      const ref = [ast.val[1] - 1, parse_col_id_format(ast.val[0])]
      return `g('${ref[0]}.${ref[1]}')` // TODO: this might need to change when `g` changes
    }
    default: {
      console.log(ast)
      return `throw Error('Invalid type error')`
    }
  }
}

export { parse, compile, transpile }
