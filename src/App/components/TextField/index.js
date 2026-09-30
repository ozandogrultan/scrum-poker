import React from 'react';

import Label from '../Label';

import Wrapper from './Wrapper';
import InputGroup from './InputGroup';

class TextField extends React.Component {
  render() {
    const {
      name,
      label,
      labelInfo,
      className,
      errorText,
      ...restOf
    } = this.props;

    const describedBy =
      [restOf['aria-describedby'], errorText && `${name}-error`]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
      <Wrapper className={className}>
        {label && <Label htmlFor={name}>{label}</Label>}
        <InputGroup id={name} name={name} aria-invalid={!!errorText} {...restOf} aria-describedby={describedBy} />
        {errorText && <span id={`${name}-error`} role='alert'>{errorText}</span>}
      </Wrapper>
    );
  }
}

export default TextField;
