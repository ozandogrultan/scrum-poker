import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

import Button from '../../components/Button';
import Wrapper from './Wrapper';

const LinkButton = styled(Button.withComponent(Link))`
  color: ButtonText;
  background: ButtonFace;
  border: 2px outset ButtonFace;
  text-align: center;
  text-decoration: none;
`;

class Home extends Component {
  render() {
    return (
      <Wrapper as='main'>
        <h1>Scrum Poker Planning</h1>
        <LinkButton to={'./poker-planning-add-story-list'}>
          Add Story List
        </LinkButton>
      </Wrapper>
    );
  }
}
export default Home;
