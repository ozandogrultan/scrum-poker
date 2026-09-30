import styled from 'styled-components';
import { colors, radius, spacing } from '../../components/tokens';

const Voters = styled.div`
  border: 1px solid ${colors.ink};
  border-radius: ${radius.control};
  margin: ${spacing.field};
  max-height: 150px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
`;

export default Voters;
