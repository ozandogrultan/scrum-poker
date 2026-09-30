import styled from 'styled-components';
import { spacing, type } from '../tokens';

const Label = styled.label`
  display: flex;
  font-size: ${type.body};
  font-weight: ${type.labelWeight};
  margin: 0 ${spacing.field} ${spacing.field} 0;
`;

export default Label;
