import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';

import Rectangle from '../../components/Rectangle';
import PageLayout from '../../components/PageLayout';
import TextField from '../../components/TextField';
import Button from '../../components/Button';

import Wrapper from './Wrapper';
import Api, { isPositiveInteger, validateStories, decodeSessionName } from '../../common/api';

class SubmitDeveloperId extends Component {
  constructor(props) {
    super(props);
    const rawSessionName =
      props.match && props.match.params && props.match.params.sessionName;
    this.sessionName = decodeSessionName(rawSessionName);
    this.state = {
      id: '',
      storyList: [],
      loading: true,
      error: '',
      idError: ''
    };
    this.onTextChange = this.onTextChange.bind(this);
    this.routeChange = this.routeChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
    this.api = new Api();
    this.loadStories = this.loadStories.bind(this);
  }

  componentDidMount() {
    this.loadStories();
  }

  componentWillUnmount() {
    this.unmounted = true;
    this.api.close();
  }

  async loadStories() {
    if (this.loading) return;
    this.loading = true;
    this.setState({ loading: true, error: '' });
    try {
      const storyList = validateStories(
        await this.api.request(
          `/poker-planning-view-as-developer/${encodeURIComponent(this.sessionName)}`
        )
      );
      if (!this.unmounted) this.setState({ storyList });
    } catch (error) {
      if (!this.unmounted) this.setState({ error: error.message });
    } finally {
      this.loading = false;
      if (!this.unmounted) this.setState({ loading: false });
    }
  }

  onSubmit(event) {
    event.preventDefault();
    this.routeChange();
  }

  routeChange() {
    const { id, storyList } = this.state;
    if (!isPositiveInteger(id)) {
      this.setState({ idError: 'Enter a positive whole-number voter ID assigned by your facilitator.' });
      return;
    }
    if (this.state.loading || this.state.error || !storyList.length) return;
    const path = `/poker-planning-view-as-developer/${encodeURIComponent(this.sessionName)}/developers/${Number(id)}`;
    this.props.history.push({
      pathname: path,
      state: {
        id: String(Number(id)),
        storyList
      }
    });
  }

  onTextChange(event) {
    const { value, name } = event.target;
    this.setState({ [name]: value });
  }

  render() {
    const { id, loading, error, idError, storyList } = this.state;
    return (
      <PageLayout>
        <Rectangle>Scrum Poker</Rectangle>
        <h1>Join a session</h1>
        {loading && <p role='status'>Loading stories…</p>}
        {error && <div role='alert'><p>{error}</p><Button onClick={this.loadStories}>Try again</Button></div>}
        {!loading && !error && !storyList.length && <p role='status'>No stories yet. Ask the facilitator to start the session. <Button onClick={this.loadStories}>Refresh stories</Button></p>}
        <Wrapper as='form' noValidate onSubmit={this.onSubmit}>
          <TextField
            name='id'
            width='600px'
            margin='0 18px 0 0'
            label='Enter developer (voter) ID'
            value={id}
            onChange={this.onTextChange}
            inputMode='numeric'
            errorText={idError}
          />
          <Button
            type='submit'
            disabled={loading || !!error || !storyList.length}
          >
            View Planning
          </Button>
        </Wrapper>
      </PageLayout>
    );
  }
}
export default withRouter(SubmitDeveloperId);
