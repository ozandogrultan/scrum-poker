import styled from 'styled-components';
import ReactTable from 'react-table';
import 'react-table/react-table.css';
import { type } from '../tokens';

const Table = styled(ReactTable)`
  height: 500px;
  min-width: 0;

  && .rt-th, && .rt-tbody .rt-td {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .-pagination button, .-pagination input, .-pagination select {
    min-height: 44px;
    font-size: ${type.body};
  }

  .-pagination .-previous, .-pagination .-next {
    align-self: center;
  }

  @media (max-width: 719px) {
    height: 360px;
  }
`;

export default Table;
