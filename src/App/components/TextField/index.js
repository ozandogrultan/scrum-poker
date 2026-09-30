import React from 'react';
import styled from 'styled-components';

import Label from '../Label';

import Wrapper from './Wrapper';
import InputGroup from './InputGroup';

const ErrorMessage = styled.span`
  font-size: 14px;
  font-weight: 600;
  line-height: 18px;
  overflow-wrap: anywhere;
`;

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
      <Wrapper className={className} textarea={restOf.textarea}>
        {label && <Label htmlFor={name}>{label}</Label>}
        <InputGroup id={name} name={name} aria-invalid={!!errorText} {...restOf} aria-describedby={describedBy} />
        {errorText && <ErrorMessage id={`${name}-error`} role='alert'>{errorText}</ErrorMessage>}
      </Wrapper>
    );
  }
}

export default TextField;
