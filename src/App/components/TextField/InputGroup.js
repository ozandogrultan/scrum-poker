import React from 'react';
import styled, { css } from 'styled-components';
import { colors, radius, spacing, type, focusRing } from '../tokens';

const field = css`
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  font-family: inherit;
  ${focusRing}
  border: 1px solid ${colors.ink};
  border-radius: ${radius.control};
  padding: ${spacing.field};
  font-size: ${type.body};
  font-weight: ${type.labelWeight};
  width: ${props => props.width};
  margin: ${props => props.margin};
`;

const Input = styled.input`
  ${field};

  @media (max-width: 1199px) {
    width: 100%;
    margin: 0;
  }
`;

const TextArea = styled.textarea`
  ${field};
  width: 100%;
  min-height: 300px;
  margin-bottom: ${spacing.group};
  resize: vertical;
`;

class InputGroup extends React.PureComponent {
  render() {
    const { textarea, ...rest } = this.props;
    const Element = textarea ? TextArea : Input;
    return <Element {...rest} />;
  }
}

export default InputGroup;
