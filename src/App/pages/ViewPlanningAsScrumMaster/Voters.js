import styled from 'styled-components';
import { colors, spacing } from '../../components/tokens';

const Voters = styled.div`
  border: 1px solid ${colors.ink};
  margin: ${spacing.field};
  max-height: 150px;
  overflow: scroll;
`;

export default Voters;
