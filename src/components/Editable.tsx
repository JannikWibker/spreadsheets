import React, { Component } from 'react'
import '../css/editable.css'

interface IProps {
  raw_data: string,
  text?: string,
  pretty_text?: string,
  setInnerHTML: boolean,
  isFocused: boolean, // TODO: this is not being used?
  cb: (value: string) => any,
  onArrowKeyEvent?: (key: "ArrowLeft" | "ArrowUp" | "ArrowRight" | "ArrowDown", shift: boolean, alt: boolean, ctrl: boolean, preventDefault: () => any) => any
}

interface IState {
  editing: boolean,
  old_text: string,
  text: string,
  pretty_text: string
}

export default class Editable extends Component<IProps, IState> {

  el: HTMLInputElement | null = null

  constructor(props: Readonly<IProps> & Readonly<{ children?: React.ReactNode }>) {
    super(props)

    this.state = {
      editing: false,
      old_text: this.props.raw_data || this.props.text || this.props.children!.toString(),
      text: this.props.raw_data || this.props.text || this.props.children!.toString(),
      pretty_text: this.props.text || this.props.children!.toString()
    }


    this.startEdit = this.startEdit.bind(this)
    this.finishEdit = this.finishEdit.bind(this)
    this.cancelEdit = this.cancelEdit.bind(this)
    this.onKeyDown = this.onKeyDown.bind(this)
    this.onChange = this.onChange.bind(this)
  }

  // static getDerivedStateFromProps(nextProps, prevState) {
  //   console.log(nextProps)
  //   const newText = nextProps.raw_data || nextProps.text || nextProps.children
  //   if(newText !== prevState.text || prevState.editing) {
  //     console.log('text has changed: ', newText, prevState.text)
  //     console.log({
  //       old_text: newText,
  //       text: prevState.editing ? prevState.text : newText,
  //       pretty_text: nextProps.text || nextProps.children
  //     })
  //     return {
  //       old_text: newText,
  //       text: prevState.editing ? prevState.text : newText,
  //       pretty_text: nextProps.text || nextProps.children
  //     }
  //   } else {
  //     return null
  //   }
  // }

  UNSAFE_componentWillReceiveProps(nextProps: Readonly<IProps> & Readonly<{ children?: React.ReactNode }>) { // TODO: replace componentWillReceiveProps with getDerivedStateFromProps (https://hackernoon.com/replacing-componentwillreceiveprops-with-getderivedstatefromprops-c3956f7ce607)
    // console.log(nextProps)
    const newText = nextProps.raw_data || nextProps.text || nextProps.children!.toString()
    // console.log('idk', newText, nextProps, this.state)
    if(newText !== this.state.text || this.state.editing || nextProps.pretty_text !== this.state.pretty_text) {
      console.log('text has changed: ', newText, this.state.text)
      // console.log({
      //   old_text: newText,
      //   text: this.state.editing ? this.state.text : newText,
      //   pretty_text: nextProps.text || nextProps.children
      // })
      this.setState({
        old_text: newText,
        text: this.state.editing ? this.state.text : newText,
        pretty_text: nextProps.text || nextProps.children!.toString()
      })
    }
  }

  startEdit(_e?: React.MouseEvent<HTMLSpanElement, MouseEvent>) {
    this.setState({editing: true, old_text: this.state.text}, () => {
      this.el!.focus()
      this.el!.setSelectionRange(0, this.el!.value.length)
    })
  }

  finishEdit() {
    this.setState({editing: false, old_text: this.state.text})
    this.props.cb(this.state.text)
  }

  cancelEdit() {
    this.setState({editing: false, text: this.state.old_text})
  }

  onKeyDown(e: React.KeyboardEvent<HTMLInputElement> & { target: HTMLInputElement }) {
    if(e.target.nodeName === 'INPUT') {
      if(e.key === 'Enter' || e.key === 'Tab') this.finishEdit()
      else if(e.key === 'Escape') this.cancelEdit()
    } else if(e.target.nodeName === 'SPAN') {
      if((e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown') && this.props.onArrowKeyEvent) {
        this.props.onArrowKeyEvent(e.key, e.shiftKey, e.altKey, e.ctrlKey || e.metaKey, e.preventDefault.bind(e))
      } else if(e.key === 'Backspace') {
        this.setState({text: '', pretty_text: '', old_text: ''}, () => this.props.cb(''))
      } else if(e.altKey || e.metaKey || e.shiftKey) {
        // nothing
      } else this.startEdit()
    }
  }

  onChange(e: React.ChangeEvent<HTMLInputElement> & { target: HTMLInputElement }) {
    this.setState({text: e.target.value.trim()})
  }

  render() {
    return this.state.editing
        ? <input className="editable-input"
            type='text'
            onChange={this.onChange}
            onBlur={this.finishEdit}
            onKeyDown={this.onKeyDown}
            defaultValue={this.state.text}
            ref={el => this.el = el} />
        : this.props.setInnerHTML
          ? <span
              tabIndex={0}
              onKeyDown={this.onKeyDown}
              onDoubleClick={this.startEdit}
              dangerouslySetInnerHTML={{__html: this.state.pretty_text}} />
          : <span
              tabIndex={0}
              onKeyDown={this.onKeyDown}
              onDoubleClick={this.startEdit}>
                {this.state.pretty_text}
            </span>
  }
}

/*

behavior with raw data:
it should show the prettified (non-raw) data in the span and as soon as
the user clicks on the span switch to an input field with the raw data in it
the user can edit the raw data and as soon as he modifies it the callback function is called
and the span now shows the new prettified data and not the old one
*/