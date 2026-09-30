import React, { Component } from 'react';
import { Link, withRouter } from 'react-router-dom';

import PageLayout from '../../components/PageLayout';
import Rectangle from '../../components/Rectangle';
import { SmallRectangle } from '../../components/Rectangle';
import FieldSet from '../../components/FieldSet';
import Legend from '../../components/Legend';
import Label from '../../components/Label';
import Table from '../../components/Table';
import P from '../../components/P';
import dayList from '../../common/dayList';
import columns from '../../common/columns';
import { ACTIVE } from '../../common/storyStatus';

import BodyWrapper from './BodyWrapper';
import LabelWrapper from './LabelWrapper';
import DayList from './DayList';
import Button from '../../components/Button';
import Api, { isPositiveInteger, validateStories, decodeSessionName } from '../../common/api';

class ViewPlanningAsDeveloper extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selected: null,
      currentStoryList: [],
      loading: true,
      error: '',
      voteError: '',
      saving: false
    };

    this.handleSelect = this.handleSelect.bind(this);
    this.loadStories = this.loadStories.bind(this);
    this.api = new Api();
  }

  componentDidMount() {
    this.connectEvents();
    this.loadStories();
  }

  connectEvents() {
    const rawSessionName =
      this.props.match && this.props.match.params && this.props.match.params.sessionName;
    const sessionName = decodeSessionName(rawSessionName);
    if (!sessionName) return;
    this.api.subscribeEvents(`/events/${encodeURIComponent(sessionName)}`, data => {
      if (this.unmounted) return;
      if (data.type === 'progress' || data.type === 'init') {
        if (Array.isArray(data.storyList)) {
          const currentStoryList = data.storyList;
          const activeIndex = currentStoryList.findIndex(row => row.status === ACTIVE);
          const changed =
            this.activeIndex !== activeIndex ||
            this.activeStory !== this.getActiveStory(currentStoryList);
          this.activeIndex = activeIndex;
          this.activeStory = this.getActiveStory(currentStoryList);
          this.setState({
            currentStoryList,
            error: '',
            loading: false,
            ...(changed ? { selected: null, voteError: '' } : {})
          });
        }
      }
    });
  }

  componentWillUnmount() {
    this.unmounted = true;
    clearTimeout(this.poll);
    this.api.close();
  }

  async loadStories() {
    if (this.loading || this.saving || this.unmounted) return;
    clearTimeout(this.poll);
    this.loading = true;
    try {
      const currentStoryList = validateStories(await this.api.request(
        `/poker-planning-view-as-developer/${encodeURIComponent(decodeSessionName(this.props.match.params.sessionName))}/developers/${this.props.match.params.id}`
      ));
      const activeIndex = currentStoryList.findIndex(row => row.status === ACTIVE);
      const changed = this.activeIndex !== activeIndex || this.activeStory !== this.getActiveStory(currentStoryList);
      this.activeIndex = activeIndex;
      this.activeStory = this.getActiveStory(currentStoryList);
      if (!this.unmounted) this.setState({ currentStoryList, error: '', loading: false, ...(changed ? { selected: null, voteError: '' } : {}) });
    } catch (error) {
      if (!this.unmounted) this.setState({ error: error.message, loading: false });
    } finally {
      this.loading = false;
      if (!this.unmounted) this.poll = setTimeout(this.loadStories, 2000);
    }
  }

  async handleSelect(e) {
    if (this.saving || this.loading || this.state.error || this.state.selected) return;
    const id = this.props.match.params.id;
    if (!isPositiveInteger(id) || this.activeIndex < 0) return;
    const selected = e.currentTarget.textContent;
    this.saving = true;
    clearTimeout(this.poll);
    this.setState({ saving: true, voteError: '' });
    try {
      await this.api.request(`/poker-planning-view-as-developer/${encodeURIComponent(decodeSessionName(this.props.match.params.sessionName))}/developers/${id}`, {
        method: 'POST',
        body: JSON.stringify({
          id,
          selected,
           story: this.activeStory,
           storyId: this.state.currentStoryList[this.activeIndex].id
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      }, false);
      if (!this.unmounted) this.setState({ selected });
    } catch (error) {
      if (!this.unmounted) this.setState({ voteError: `Your vote was not confirmed. ${error.message}` });
    } finally {
      this.saving = false;
      if (!this.unmounted) {
        this.setState({ saving: false });
        this.loadStories();
      }
    }
  }

  getActiveStory(data) {
    const active = data.find(obj => obj.status === ACTIVE);
    return active ? active.story : '';
  }

  render() {
    const { currentStoryList: data, selected, loading, error, voteError, saving } = this.state;
    const activeStory = this.getActiveStory(data);
    const validId = isPositiveInteger(this.props.match.params.id);
    return (
      <PageLayout>
        <Rectangle>Scrum Poker</Rectangle>
        <h1>Vote on stories</h1>
        {loading && <p role='status'>Loading stories…</p>}
        {error && <div role='alert'><p>{error}</p><Button onClick={this.loadStories}>Try again</Button></div>}
        {!validId && <p role='alert'>Enter a valid voter ID. <Link to={`/poker-planning-view-as-developer/${encodeURIComponent(decodeSessionName(this.props.match.params.sessionName))}`}>Choose voter ID</Link></p>}
        {!loading && !error && !data.length && <p role='status'>No stories yet. Ask the facilitator to start the session.</p>}
        {!loading && !error && !!data.length && !activeStory && <p role='status'>All stories have been estimated.</p>}
        <BodyWrapper>
          <LabelWrapper>
            <Label>Story List</Label>
            <Table
              style={{ width: '100%' }}
              data={data}
              resolveData={data => data.map(row => row)}
              columns={columns}
              loading={loading}
              NoDataComponent={() => <span>No stories</span>}
            />
          </LabelWrapper>
          <LabelWrapper>
            <Label>Active Story</Label>
            <FieldSet>
              <Legend>{activeStory}</Legend>
              <DayList>
                {activeStory && validId && dayList.map(day => (
                  <SmallRectangle
                    key={day}
                    onClick={this.handleSelect}
                    selected={parseInt(selected) === day}
                    aria-pressed={parseInt(selected, 10) === day}
                    disabled={saving || !!selected || !!error || loading}
                  >
                    {day}
                  </SmallRectangle>
                ))}
                <P role='status'>{saving ? 'Saving vote…' : selected ? `${selected} Voted` : activeStory ? 'Please Vote!' : 'No active story'}</P>
                {voteError && <p role='alert'>{voteError} Select your estimate to try again.</p>}
              </DayList>
            </FieldSet>
          </LabelWrapper>
        </BodyWrapper>
      </PageLayout>
    );
  }
}
export default withRouter(ViewPlanningAsDeveloper);
