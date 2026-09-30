import { css } from 'styled-components';

export const colors = {
  outline: 'lightblue',
  selected: 'lightgreen',
  ink: 'black'
};

export const radius = {
  control: '3px',
  tile: '6px'
};

export const spacing = {
  field: '12px',
  inset: '18px',
  group: '24px'
};

export const type = {
  body: '18px',
  title: '24px',
  labelWeight: 600
};

export const focusRing = css`
  &:focus { outline: 2px solid ${colors.ink}; outline-offset: 3px; }
`;
