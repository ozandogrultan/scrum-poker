import styled from 'styled-components';

const PageLayout = styled.main`
  box-sizing: border-box;
  width: 100%;
  max-width: 1800px;
  margin: 0 auto;
  padding: 24px 16px;
  overflow-wrap: anywhere;

  @media (min-width: 720px) {
    padding: 48px 32px;
  }

  @media (min-width: 1200px) {
    padding: 74px 48px 48px;
  }
`;

export default PageLayout;
