import styled from 'styled-components';
import ReactTable from 'react-table';
import 'react-table/react-table.css';
import { colors, radius, type } from '../tokens';

const Table = styled(ReactTable)`
  height: 500px;
  min-width: 0;
  border-radius: ${radius.control};
  font-family: inherit;
  font-variant-numeric: tabular-nums;

  && .rt-th, && .rt-tbody .rt-td {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  && .rt-thead .rt-th {
    font-weight: ${type.labelWeight};
  }

  .-pagination button, .-pagination input, .-pagination select {
    min-height: 44px;
    font-size: ${type.body};
    font-family: inherit;
  }

  .-pagination button:focus, .-pagination input:focus, .-pagination select:focus {
    outline: 2px solid ${colors.ink};
    outline-offset: 2px;
  }

  .-pagination .-previous, .-pagination .-next {
    align-self: center;
  }

  @media (max-width: 719px) {
    height: 360px;
  }
`;

export default Table;
