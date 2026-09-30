import styled from 'styled-components';

const DayList = styled.div`
  width: 300px;
  max-width: 100%;
  display: flex;
  flex-direction: row;
  align-content: center;
  justify-content: space-around;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 auto;

  > p,
  > [role='status'],
  > [role='alert'] {
    width: 100%;
    text-align: center;
  }
`;

export default DayList;
