import styled from 'styled-components';
import { spacing } from '../../components/tokens';

const BodyWrapper = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  align-items: end;
  gap: ${spacing.group};

  > * {
    min-width: 0;
  }

  @media (min-width: 720px) and (max-width: 1199px) {
    > :last-child {
      grid-column: 1 / -1;
      min-height: 0;
    }
  }
`;

export default BodyWrapper;
