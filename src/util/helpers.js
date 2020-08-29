import { inlineLexer } from '../util/inline-markdown.js'
import { transpile } from './parser/index.js'

const MARKED_OPTIONS = {
  smartypants: true
}

const marked = text => inlineLexer(text, {}, MARKED_OPTIONS)

const parse_formula = text => transpile(text)

const round = (number, decimals) => Number(Math.round(number + 'e' + decimals) + 'e-' + decimals)

const range = (l) => [...Array(l)].map((x,i) => i)

const Alphabet = 'ABCDEFGHIJKLNMOPQRSTUVWXYZ'.split('')
const alphabet = 'abcdefghijklnmopqrstuvwxyz'.split('')

const default_value = tp => {
  if(tp === 'EMPTY') return ''
  if(tp === 'STRING') return ''
  if(tp === 'NUMBER') return 0
}

// format function, cell stuff is given and formatted data is returned

const format_data = (data, tp, stp, r_dec) => {
  if(typeof tp === 'undefined') throw Error('no type defined')
  else if(typeof data === 'undefined') data = default_value(tp) // throw Error('no data defined')
  if(tp === 'NUMBER') {
    // this is incase something formatted as a number is actually a string, this shouldn't break the application, just ignore the formatting
    if(typeof data !== "number" && isNaN(parseFloat(data))) return data
    if(stp === 'PERCENTAGE' && r_dec) return round(data * 100, r_dec) + '%'
    if(stp === 'PERCENTAGE') return (data * 100) + '%'
    if(r_dec) return round(data, r_dec)
    else return data
  } else if(tp === 'STRING') {
    if(stp === 'UPPERCASE') return marked(data.toUpperCase(), {}, {smartypants: true})
    if(stp === 'LOWERCASE') return marked(data.toLowerCase(), {}, {smartypants: true})
    else return marked(String(data), {}, {smartypants: true})
  } else if(tp === 'EMPTY') {
    // TODO: this is just here for debugging
    return '<empty>'
  } else {
    return data
  }
}

// turn "123" into "DS"
const generate_col_id_format = (row_id) => {

  return Alphabet[row_id] // TODO: implement something that works with more than just numbers < 26
}

// parse "ABC" into 1*26^2 + 2*26^1 * 
const parse_col_id_format = (row_id) => {

  // acc: [count, significance]
  // significance of position, reducing by one each iteration
  // this is basically iteratively converting from base 26 to base 10

  const reducer = (acc, curr) =>
    [acc[0] + (alphabet.indexOf(curr) + 1) * Math.pow(alphabet.length, acc[1] - 1), acc[1] - 1]

  if(row_id === "") return -1

  return row_id
    .toLowerCase()
    .split("")
    .reduce(reducer, [0, row_id.length])[0] - 1
}

// parse cell ids to coordinates; can parse both "ABC123" and "123.123" but not named references ("=someNamedCell")
const parse_cell_id_format = (cell_id) => {
  const excel_format = /^(?<row>[a-z]+)(?<col>[1-9]+[0-9]*)$/i
  const index_format = /^(?<row>[0-9]+).(?<col>[0-9]+)$/

  const excel_match = cell_id.match(excel_format)
  const index_match = cell_id.match(index_format)

  if(excel_match) {
    return [
      parse_col_id_format(excel_match.groups.row),
      excel_match.groups.col - 1
    ] // offsetting by one because zero-based
  } else if(index_match) {
    return [
      +index_match.groups.row,
      +index_match.groups.col
    ] // these should already be zero-based
  }
}

// Viewport stuff (for scrolling when moving the selection)

const isInViewport = (element, offset=40) => {
  let rect = element.getBoundingClientRect()
  return (
    rect.top >= (0 + offset) &&
    rect.left >= (0 + offset) &&
    rect.bottom <= ((window.innerHeigth || document.documentElement.clientHeight) - offset) &&
    rect.right <= ((window.innerWidth || document.documentElement.clientWidth) - offset)
  )
}

const scrollIntoViewIfNeeded = (element) =>
  !isInViewport(element)
    ? element.scrollIntoView({behavior: 'smooth', block: 'center'})
    : null

// Array contains keys, those keys are what is to be extracted from the object (including the values)

const destructure = (obj, template) => {
  let _obj = {}
  if(Array.isArray(template)) {
    template.forEach(key => _obj[key] = obj[key])
  } else {
    Object.keys(template).forEach(key => _obj[template[key]] = obj[key])
  }
  return _obj
}

// create specific cells, cells in general, whole Table, create Rows and Columns, fill in missing Ids

const createCell = (id, tp='STRING', vl=tp === 'EMPTY' ? undefined : '', stp, fn) => ({ id, tp, stp, vl, fn })

const createEmptyCell = (id) => createCell(id, 'EMPTY')
const createStringCell = (id, vl, fn, stp) => createCell(id, 'STRING', vl, stp, fn)
const createNumberCell = (id, vl, fn, stp) => createCell(id, 'NUMBER', vl, stp, fn)

const createRow = (start, end, col, cell) =>
  range(end-start)
    .map(x => x + start)
    .map(x => cell
      ? createCell('' + col + '.' + x, cell.tp, cell.vl, cell.stp, cell.fn)
      : createCell('' + col + '.' + x)
    )

const createCol = (start, end, row, cell) =>
  range(end-start)
    .map(x => x + start)
    .map(x => cell
      ? createCell('' + x + '.' + row, cell.tp, cell.vl, cell.stp, cell.fn)
      : createCell('' + x + '.' + row))

const createTable = (start_x, start_y, end_x, end_y, cell) =>
  range(end_y - start_y)
    .map(x => x + start_y)
    .map(x => createRow(start_x, end_x, x, cell))

const fillTableEmpty = (height, width, array) =>
  range(height).map(x =>
    range(width).map(y =>
      array[x]
      ? array[x][y]
        ? array[x][y]
        : createEmptyCell('' + x + '.' + y)
      : createRow(0, width, x, createEmptyCell())
  ))

const fillTableIds = (height, width, array) =>
  range(height).map(x =>
    range(width).map(y =>
      array[x]
      ? array[x][y]
        ? array[x][y].id
          ? array[x][y]
          : {id: '' + x + '.' + y, ...array[x][y]}
        : createStringCell('' + x + '.' + y, '**WARNING**: MISSING CELL')
      : createRow(0, width, x, createStringCell(null, '**WARNING**: MISSING CELL'))
  ))

export default {
  range,
  createCell,
  createEmptyCell,
  createStringCell,
  createNumberCell,
  createRow,
  createCol,
  createTable,
  fillTableEmpty,
  fillTableIds,
  round,
  destructure,
  default_value,
  isInViewport,
  scrollIntoViewIfNeeded,
  marked,
  format_data,
  Alphabet,
  alphabet,
  generate_col_id_format,
  parse_col_id_format,
  parse_cell_id_format,
}

export {
  range,
  createCell,
  createEmptyCell,
  createStringCell,
  createNumberCell,
  createRow,
  createCol,
  createTable,
  fillTableEmpty,
  fillTableIds,
  round,
  destructure,
  default_value,
  isInViewport,
  scrollIntoViewIfNeeded,
  marked,
  parse_formula,
  format_data,
  Alphabet,
  alphabet,
  generate_col_id_format,
  parse_col_id_format,
  parse_cell_id_format,
}
