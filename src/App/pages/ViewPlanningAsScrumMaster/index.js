import React, { Component } from 'react';
import { Redirect, withRouter } from 'react-router-dom';

import PageLayout from '../../components/PageLayout';
import Rectangle from '../../components/Rectangle';
import { SmallRectangle } from '../../components/Rectangle';
import FieldSet from '../../components/FieldSet';
import Legend from '../../components/Legend';
import Label from '../../components/Label';
import Table from '../../components/Table';
import P from '../../components/P';
import Button from '../../components/Button';
import dayList from '../../common/dayList';
import columns from '../../common/columns';
import { ACTIVE, VOTED, NOT_VOTED } from '../../common/storyStatus';

import BodyWrapper from './BodyWrapper';
import BottomWrapper from './BottomWrapper';
import LabelWrapper from './LabelWrapper';
import VoterWrapper from './VoterWrapper';
import Voters from './Voters';
import DayList from './DayList';
import Header from './Header';
import FinalScore from './FinalScore';
import Api, { validateStories, decodeSessionName } from '../../common/api';

const SETUP_ROUTE = '/poker-planning-add-story-list';

const isValidVoterCount = value => parseInt(value, 10) >= 1;

const readSavedSetup = key => {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key));
    return saved && isValidVoterCount(saved.numberOfVoters) ? saved : null;
  } catch (e) {
    return null;
  }
};

const isValidId = id => /^\d+$/.test(String(id));

const isValidEstimate = selected =>
  /^\d+$/.test(String(selected)) && dayList.includes(Number(selected));

const findVote = (voteMapping, i) =>
  voteMapping.find(vote => vote && isValidId(vote.id) && Number(vote.id) === i);

const saveSetup = (key, numberOfVoters, facilitatorToken) => {
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ numberOfVoters, ...(facilitatorToken ? { facilitatorToken } : {}) })
    );
  } catch (e) {}
};

class ViewPlanningAsScrumMaster extends Component {
  constructor(props) {
    super(props);
    const rawSessionName =
      props.match && props.match.params && props.match.params.sessionName;
    this.sessionName = decodeSessionName(rawSessionName);
    this.storageKey = `scrum-poker:session:${this.sessionName}`;
    this.setup = this.resolveSetup();
    this.facilitatorToken = (this.setup && this.setup.facilitatorToken) || null;
    this.api = new Api();
    this.version = 0;
    this.unmounted = false;
    this.state = {
      selected: null,
      votingFinished: false,
      currentData: [],
      voteMapping: [],
      finalScore: '',
      initError: '',
      pollError: '',
      endError: '',
      saving: false,
      copied: false,
      liveConnected: false
    };
    this.handleSelect = this.handleSelect.bind(this);
    this.handleFinalScore = this.handleFinalScore.bind(this);
    this.handleEndVote = this.handleEndVote.bind(this);
    this.handleCopyLink = this.handleCopyLink.bind(this);
    this.handleRestartVoting = this.handleRestartVoting.bind(this);
    this.handleExportCsv = this.handleExportCsv.bind(this);
    this.initialize = this.initialize.bind(this);
    this.poll = this.poll.bind(this);
  }

  resolveSetup() {
    const storageKey = this.storageKey;
    const routeState = this.props.location.state;
    const saved = readSavedSetup(storageKey);
    if (
      routeState &&
      Array.isArray(routeState.data) &&
      isValidVoterCount(routeState.numberOfVoters)
    ) {
      if (routeState.initialized) {
        const numberOfVoters = saved
          ? saved.numberOfVoters
          : routeState.numberOfVoters;
        const facilitatorToken = (saved && saved.facilitatorToken) || routeState.facilitatorToken || null;
        saveSetup(storageKey, numberOfVoters, facilitatorToken);
        return { numberOfVoters, facilitatorToken, data: [], isNew: false };
      }
      return {
        numberOfVoters: routeState.numberOfVoters,
        facilitatorToken: routeState.facilitatorToken || null,
        data: routeState.data,
        isNew: true
      };
    }
    if (saved) {
      return {
        numberOfVoters: saved.numberOfVoters,
        facilitatorToken: saved.facilitatorToken || null,
        data: [],
        isNew: false
      };
    }
    return null;
  }

  handleFinalScore(event) {
    const { value, name } = event.target;
    this.setState({ [name]: value });
  }

  isVotesEqual() {
    const uniqueVotes = [
      ...new Set(
        new Set(this.state.voteMapping.map(vote => vote.selected)).add(
          this.state.selected
        )
      )
    ];
    return uniqueVotes.length === 1;
  }

  renderVoters() {
    const { numberOfVoters } = this.setup;
    const voters = [];
    if (this.state.votingFinished) {
      // If voting is finished, display each vote as numbers
      for (let i = 1; i <= numberOfVoters; i++) {
        voters.push(
          <VoterWrapper key={i}>
            <P>Voter {i}:</P>
            <P>
              {(findVote(this.state.voteMapping, i) || {}).selected ||
                NOT_VOTED}
            </P>
          </VoterWrapper>
        );
      }
    } else {
      for (let i = 1; i <= numberOfVoters; i++) {
        voters.push(
          <VoterWrapper key={i}>
            <P>Voter {i}:</P>
            <P>
              {this.state.voteMapping.find(obj => parseInt(obj.id) === i)
                ? VOTED
                : NOT_VOTED}
            </P>
          </VoterWrapper>
        );
      }
    }
    return voters;
  }

  isVotingFinished(voteMapping, selected) {
    const { numberOfVoters } = this.setup;
    // Check if voter ids are in range 1 and numberOfVoters and Scrum Master also voted
    const count = parseInt(numberOfVoters, 10);
    const ids = voteMapping.map(vote => vote && vote.id);
    if (!selected || !ids.every(isValidId)) return false;
    if (new Set(ids.map(Number)).size !== ids.length) return false;
    if (ids.some(id => Number(id) < 1 || Number(id) > count)) return false;
    for (let i = 1; i <= count; i++) {
      const vote = findVote(voteMapping, i);
      if (!vote || !isValidEstimate(vote.selected)) return false;
    }
    return true;
  }

  async fetchStories() {
    const version = this.version;
    const currentData = validateStories(
      await this.api.request(
        `/poker-planning-view-as-scrum-master/${encodeURIComponent(this.sessionName)}`
      )
    );
    if (!this.unmounted && version === this.version) {
      this.setState({ currentData });
    }
  }

  async fetchVotes() {
    const version = this.version;
    const voteMapping = await this.api.request(
      `/vote-mapping/${encodeURIComponent(this.sessionName)}`
    );
    if (!Array.isArray(voteMapping)) {
      throw new Error('The server returned an invalid vote list. Try again.');
    }
    if (!this.unmounted && version === this.version) {
      this.setState(({ selected }) => ({
        voteMapping,
        votingFinished: this.isVotingFinished(voteMapping, selected)
      }));
    }
  }

  async poll() {
    try {
      await Promise.all([this.fetchStories(), this.fetchVotes()]);
      if (!this.unmounted) this.setState({ pollError: '' });
    } catch (error) {
      if (!this.unmounted) this.setState({ pollError: error.message });
    } finally {
      if (!this.unmounted) this.timer = setTimeout(this.poll, 2000);
    }
  }

  async initialize() {
    if (this.initializing || this.unmounted) return;
    this.initializing = true;
    this.setState({ initError: '' });
    try {
      const response = await this.api.request(
        `/poker-planning-view-as-developer/${encodeURIComponent(this.sessionName)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            storyList: this.setup.data,
            numberOfVoters: parseInt(this.setup.numberOfVoters, 10),
            ...(this.facilitatorToken ? { facilitatorToken: this.facilitatorToken } : {})
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        },
        false
      );
      const serverToken =
        response && response.headers && typeof response.headers.get === 'function'
          ? response.headers.get('x-facilitator-token')
          : null;
      if (serverToken) {
        this.facilitatorToken = serverToken;
      }
    } catch (error) {
      if (!this.unmounted) {
        this.setState({
          initError: `The session could not be started. ${error.message}`
        });
      }
      return;
    } finally {
      this.initializing = false;
    }
    if (this.unmounted) return;
    saveSetup(this.storageKey, this.setup.numberOfVoters, this.facilitatorToken);
    const { pathname, search, hash, state } = this.props.location;
    this.props.history.replace({
      pathname,
      search,
      hash,
      state: { ...state, initialized: true, facilitatorToken: this.facilitatorToken }
    });
    this.timer = setTimeout(this.poll, 2000);
  }

  componentDidMount() {
    if (!this.setup) {
      return;
    }
    this.connectEvents();
    if (this.setup.isNew) {
      this.initialize();
    } else {
      this.poll();
    }
  }

  connectEvents() {
    this.api.subscribeEvents(
      `/events/${encodeURIComponent(this.sessionName)}`,
      data => {
        if (this.unmounted) return;
        if (!this.state.liveConnected) this.setState({ liveConnected: true });
        if (data.type === 'vote' || data.type === 'init') {
          if (Array.isArray(data.votes)) {
            this.setState(({ selected }) => ({
              voteMapping: data.votes,
              votingFinished: this.isVotingFinished(data.votes, selected)
            }));
          }
        }
        if (data.type === 'progress' || data.type === 'init') {
          if (Array.isArray(data.storyList)) {
            this.setState({ currentData: data.storyList });
          }
        }
      },
      () => {
        if (!this.unmounted && this.state.liveConnected) {
          this.setState({ liveConnected: false });
        }
      },
      () => {
        if (!this.unmounted && !this.state.liveConnected) {
          this.setState({ liveConnected: true });
        }
      }
    );
  }

  handleCopyLink() {
    const link = `${window.location.origin}/poker-planning-view-as-developer/${encodeURIComponent(this.sessionName)}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(link).catch(() => {});
    }
    this.setState({ copied: true });
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => {
      if (!this.unmounted) this.setState({ copied: false });
    }, 2000);
  }

  async handleRestartVoting() {
    const sessionName = this.sessionName;
    this.setState({ saving: true, endError: '' });
    try {
      await this.api.request(
        `/poker-planning-view-as-scrum-master/${encodeURIComponent(sessionName)}/reset-votes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.facilitatorToken ? { 'X-Facilitator-Token': this.facilitatorToken } : {})
          }
        },
        false
      );
      if (!this.unmounted) {
        this.setState({
          voteMapping: [],
          votingFinished: false,
          selected: null,
          finalScore: ''
        });
      }
    } catch (err) {
      if (!this.unmounted) {
        this.setState({ endError: `Could not restart voting: ${err.message}` });
      }
    } finally {
      if (!this.unmounted) this.setState({ saving: false });
    }
  }

  handleExportCsv() {
    const { currentData } = this.state;
    const header = 'Story ID,Story,Story Point,Status\n';
    const rows = currentData
      .map(row => {
        const escapedStory = `"${String(row.story || '').replace(/"/g, '""')}"`;
        return `${row.id || ''},${escapedStory},${row.storyPoint || ''},${row.status || ''}`;
      })
      .join('\n');
    const csvContent = header + rows;
    if (typeof window !== 'undefined' && typeof window.Blob !== 'undefined' && typeof window.URL !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.sessionName || 'session'}-estimates.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }

  componentWillUnmount() {
    this.unmounted = true;
    clearTimeout(this.timer);
    clearTimeout(this.copyTimer);
    this.api.close();
  }

  async handleEndVote() {
    const sessionName = this.sessionName;
    const { currentData, saving } = this.state;
    const finalScore = this.state.finalScore.trim();
    if (!finalScore || saving) return;
    if (!isValidEstimate(finalScore)) {
      this.setState({ endError: 'Choose a final score from the available estimates.' });
      return;
    }
    let nextActiveStoryIndex = null;
    const nextState = currentData.map((obj, i) => {
      if (obj.status === ACTIVE) {
        // Change current ACTIVE story to VOTED
        nextActiveStoryIndex = i + 1;
        return {
          ...obj,
          story: obj.story,
          storyPoint: finalScore,
          status: VOTED
        };
      } else if (i === nextActiveStoryIndex) {
        // Make the story coming after VOTED one ACTIVE
        return {
          ...obj,
          story: obj.story,
          storyPoint: obj.storyPoint,
          status: ACTIVE
        };
      }
      return {
        ...obj,
        story: obj.story,
        storyPoint: obj.storyPoint,
        status: obj.status
      };
    });
    this.version++;
    this.setState({ saving: true, endError: '' });
    try {
      await this.api.request(
        `/poker-planning-view-as-scrum-master/${encodeURIComponent(sessionName)}`,
        {
          method: 'POST',
          body: JSON.stringify(nextState),
          headers: {
            'Content-Type': 'application/json',
            ...(this.facilitatorToken ? { 'X-Facilitator-Token': this.facilitatorToken } : {})
          }
        },
        false
      );
      if (!this.unmounted) {
        this.setState({
          currentData: nextState,
          voteMapping: [],
          votingFinished: false,
          selected: null,
          finalScore: ''
        });
      }
    } catch (error) {
      if (!this.unmounted) {
        this.setState({
          endError: `Voting was not ended. ${error.message}`
        });
      }
    } finally {
      this.version++;
      if (!this.unmounted) this.setState({ saving: false });
    }
  }

  handleSelect(e) {
    const selected = e.currentTarget.textContent;
    this.setState(({ voteMapping }) => ({
      selected,
      votingFinished: this.isVotingFinished(voteMapping, selected)
    }));
  }

  getActiveStory(data) {
    const active = data.find(obj => obj.status === ACTIVE);
    if (active) {
      return active.story;
    }
    return '';
  }

  render() {
    if (!this.setup) {
      return <Redirect to={SETUP_ROUTE} />;
    }
    const { data } = this.setup;
    const sessionName = this.sessionName;
    const {
      currentData,
      voteMapping,
      selected,
      votingFinished,
      finalScore,
      initError,
      pollError,
      endError,
      saving,
      copied,
      liveConnected
    } = this.state;
    const storyList = currentData.length ? currentData : data;

    const activeStory = this.getActiveStory(storyList);
    return (
      <PageLayout>
        <Header>
          <Rectangle>Scrum Poker</Rectangle>
          <div>
            <P small>
              Please share link of developers panel to the teammates:
              {window.location.origin}/poker-planning-view-as-developer/
              {encodeURIComponent(sessionName)}
            </P>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
              <Button type='button' onClick={this.handleCopyLink}>
                {copied ? 'Copied link!' : 'Copy invite link'}
              </Button>
              <P small role='status' style={{ margin: 0 }}>
                {liveConnected ? '● Live' : '○ Polling'}
              </P>
            </div>
          </div>
        </Header>
        <h1>Facilitate planning</h1>
        {initError && (
          <div role='alert'>
            <p>{initError}</p>
            <Button onClick={this.initialize}>Try again</Button>
          </div>
        )}
        {pollError && <p role='alert'>{pollError}</p>}
        {!!currentData.length && !activeStory && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
            <p role='status' style={{ margin: 0 }}>All stories have been estimated.</p>
            <Button type='button' onClick={this.handleExportCsv}>Export results (CSV)</Button>
          </div>
        )}
        <BodyWrapper>
          <LabelWrapper>
            <Label>Story List</Label>
            <Table
              data={currentData}
              resolveData={data => data.map(row => row)}
              columns={columns}
              loading={!currentData.length}
              NoDataComponent={() => null}
            />
          </LabelWrapper>
          <LabelWrapper>
            <Label>Active Story</Label>
            <FieldSet>
              <Legend>{activeStory}</Legend>
              <DayList>
                {dayList.map(day => (
                  <SmallRectangle
                    key={day}
                    onClick={this.handleSelect}
                     selected={parseInt(selected) === day}
                     aria-pressed={parseInt(selected, 10) === day}
                    disabled={!activeStory || saving}
                  >
                    {day}
                  </SmallRectangle>
                ))}
                <P>{selected ? `${selected} Voted` : 'Please Vote!'}</P>
              </DayList>
            </FieldSet>
          </LabelWrapper>
          <FieldSet>
            <Legend>Scrum Master Panel</Legend>
            <P>{activeStory ? `${activeStory} is active` : 'No active story'}</P>
            <Voters>{this.renderVoters()}</Voters>
            {selected ? (
              <VoterWrapper>
                <P>Scrum Master:</P>
                <P>{votingFinished ? selected : VOTED}</P>
              </VoterWrapper>
            ) : (
              <VoterWrapper>
                <P>Scrum Master:</P>
                <P>Not Voted</P>
              </VoterWrapper>
            )}
            <BottomWrapper>
              {votingFinished && !this.isVotesEqual() && (
                <P small id='finalScore-help'>
                  Seems team has different votes. Please discuss and finalize
                  the score below textbox
                </P>
              )}
              {votingFinished && selected && (
                <React.Fragment>
                  <FinalScore
                    width='100px'
                    name='finalScore'
                    label='Final score'
                    aria-describedby={
                      !this.isVotesEqual() ? 'finalScore-help' : undefined
                    }
                    value={finalScore}
                    onChange={this.handleFinalScore}
                  />
                </React.Fragment>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  disabled={!votingFinished || saving}
                  onClick={this.handleEndVote}
                >
                  End Voting For {activeStory}
                </Button>
                {activeStory && (voteMapping.length > 0 || selected) && (
                  <Button
                    type='button'
                    disabled={saving}
                    onClick={this.handleRestartVoting}
                  >
                    Restart voting
                  </Button>
                )}
              </div>
              {saving && <P small role='status'>Ending vote…</P>}
              {endError && <P small role='alert'>{endError}</P>}
              {!votingFinished && (
                <P small>You can not end voting till each teammate voted</P>
              )}
            </BottomWrapper>
          </FieldSet>
        </BodyWrapper>
      </PageLayout>
    );
  }
}
export default withRouter(ViewPlanningAsScrumMaster);
