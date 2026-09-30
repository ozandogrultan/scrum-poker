import styled from 'styled-components';

const Header = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;

  p {
    min-width: 0;
    max-width: 65ch;
  }

  @media (min-width: 900px) {
    flex-direction: row;
  }
`;

export default Header;
