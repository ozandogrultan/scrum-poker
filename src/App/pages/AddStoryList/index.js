import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';

import Rectangle from '../../components/Rectangle';
import PageLayout from '../../components/PageLayout';
import TextField from '../../components/TextField';
import P from '../../components/P';
import Button from '../../components/Button';
import { ACTIVE, NOT_VOTED } from '../../common/storyStatus';
import TextFieldWrapper from './TextFieldWrapper';
import ButtonWrapper from './ButtonWrapper';
import { isPositiveInteger } from '../../common/api';

class AddStoryList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      sessionName: '',
      numberOfVoters: '',
      storyList: '',
      errors: {}
    };

    this.onTextChange = this.onTextChange.bind(this);
    this.routeChange = this.routeChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
  }

  onSubmit(event) {
    event.preventDefault();
    this.routeChange();
  }

  initializeData(splittedStoryList) {
    return splittedStoryList.map((story, i) => {
      return {
        id: i + 1,
        story: story,
        storyPoint: '',
        status: i === 0 ? ACTIVE : NOT_VOTED
      };
    });
  }

  routeChange() {
    const { sessionName, numberOfVoters, storyList } = this.state;
    const splittedStoryList = storyList.split(/\r?\n/).map(story => story.trim()).filter(Boolean);
    const errors = {};
    if (!sessionName.trim()) errors.sessionName = 'Enter a session name.';
    if (!isPositiveInteger(numberOfVoters)) errors.numberOfVoters = 'Enter a positive whole number of voters.';
    if (!splittedStoryList.length) errors.storyList = 'Enter at least one story, one per line.';
    this.setState({ errors });
    if (Object.keys(errors).length) return;
    const data = this.initializeData(splittedStoryList);
    const path = `/poker-planning-view-as-scrum-master/${encodeURIComponent(sessionName.trim())}`;
    this.props.history.push({
      pathname: path,
      state: { data, numberOfVoters, sessionName: sessionName.trim() }
    });
  }

  onTextChange(event) {
    const { value, name, maxLength } = event.target;
    if (maxLength !== -1) {
      this.setState({ [name]: value.slice(0, maxLength) });
    } else {
      this.setState({ [name]: value });
    }
  }

  render() {
    const { sessionName, numberOfVoters, storyList, errors } = this.state;
    return (
      <PageLayout>
        <Rectangle>Scrum Poker</Rectangle>
        <h1>Start a session</h1>
        <form noValidate onSubmit={this.onSubmit}>
          <TextFieldWrapper>
            <TextField
              name='sessionName'
              width='600px'
              label='Session Name'
              value={sessionName}
              onChange={this.onTextChange}
              maxLength='200'
              errorText={errors.sessionName}
            />
            <TextField
              name='numberOfVoters'
              width='600px'
              label='Number of voters'
              value={numberOfVoters}
              onChange={this.onTextChange}
              inputMode='numeric'
              errorText={errors.numberOfVoters}
            />
          </TextFieldWrapper>
          <P id='storyList-help'>Paste your story list (Each line will be converted as a story)</P>
          <TextField textarea name='storyList' label='Story list' aria-describedby='storyList-help' value={storyList} errorText={errors.storyList} onChange={this.onTextChange} />
          <ButtonWrapper>
            <Button type='submit'>
              Start Session
            </Button>
          </ButtonWrapper>
        </form>
      </PageLayout>
    );
  }
}
export default withRouter(AddStoryList);
