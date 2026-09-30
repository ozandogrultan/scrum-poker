import styled from 'styled-components';
import { colors, radius, spacing, type, focusRing } from '../tokens';

const Rectangle = styled.div`
  border: 2px solid ${colors.outline};
  border-radius: ${radius.tile};
  padding: ${spacing.inset} ${spacing.group};
  width: 100px;
  height: 100px;
  display: flex;
  flex-direction: column;
  margin-bottom: ${spacing.group};
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.15;
  outline: none;
  font-size: ${type.title};
  font-weight: ${type.labelWeight};
  user-select: none;
`;

const SmallRectangle = styled(Rectangle).attrs({ as: 'button', type: 'button' })`
  border: 1px solid ${props => props.selected ? colors.selected : colors.outline};
  background: white;
  color: ${colors.ink};
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: content-box;
  ${focusRing}
  &[aria-pressed='true'] { font-weight: 700; box-shadow: inset 0 0 0 1px ${colors.ink}; }
  &:disabled { cursor: default; opacity: 0.6; }
  width: 20px;
  height: 20px;
`;

export default Rectangle;

export { SmallRectangle };
