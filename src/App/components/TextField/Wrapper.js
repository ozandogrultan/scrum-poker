import styled from 'styled-components';
import { spacing } from '../tokens';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  gap: ${spacing.field};

  @media (min-width: 1200px) {
    flex-direction: ${props => props.textarea ? 'column' : 'row'};
    align-items: ${props => props.textarea ? 'stretch' : 'center'};
  }
`;

export default Wrapper;
