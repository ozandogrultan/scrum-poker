import styled from 'styled-components';
import { spacing } from '../../components/tokens';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: ${spacing.group};

  @media (min-width: 900px) {
    flex-direction: row;
    align-items: flex-end;

    > :first-child {
      flex: 1;
      max-width: 760px;
    }

    > button {
      flex-shrink: 0;
    }
  }
`;

export default Wrapper;
