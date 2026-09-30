import styled from 'styled-components';
import { spacing } from '../../components/tokens';

const BodyWrapper = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  align-items: start;
  gap: ${spacing.group};

  > * {
    min-width: 0;
  }
`;

export default BodyWrapper;
