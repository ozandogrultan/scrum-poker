import styled from 'styled-components';
import { spacing } from '../tokens';

const FieldSet = styled.fieldset`
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
  display: flex;
  justify-content: center;
  flex-direction: column;
  padding: ${spacing.group} 16px;

  > legend {
    max-width: 100%;
  }

  @media (min-width: 720px) {
    min-height: 500px;
    padding: ${spacing.group};
  }
`;

export default FieldSet;
