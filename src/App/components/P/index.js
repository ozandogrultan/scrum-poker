import styled from 'styled-components';
import { type } from '../tokens';

const P = styled.p`
  font-size: ${props => (props.small ? '12px' : type.body)};
`;

export default P;
