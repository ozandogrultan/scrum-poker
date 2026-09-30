import styled from 'styled-components';
import { spacing } from '../../components/tokens';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
  padding: ${spacing.group} 16px;
  box-sizing: border-box;
  text-align: center;
`;

export default Wrapper;
