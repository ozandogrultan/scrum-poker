import styled from 'styled-components';
import { spacing } from '../../components/tokens';

const TextFieldWrapper = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr));
  align-items: start;
  gap: ${spacing.group};
  margin-bottom: ${spacing.group};
`;

export default TextFieldWrapper;
