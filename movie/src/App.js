import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import SearchPage from './pages/SearchPage';
import FilterPage from './pages/FilterPage';
import MovieDetail from './pages/MovieDetail';
import Schedules from './components/Schedules';
import ProfilePage from './pages/ProfilePage';
import FavoritesList from './components/FavoritesList';
import Footer from './components/Footer';
import ReviewsPage from './pages/ReviewsPage';
import TrendingMovies from './components/TrendingMovies';
import SharedFavorites from './components/SharedFavorites';
import EmailVerificationSuccess from './pages/EmailVerificationSuccess';
import GroupList from './components/GroupList';
import GroupPage from './pages/GroupPage';
import CreateGroup from './components/CreateGroup';
import AddMovie from './components/AddMovie';
import AddSchedule from './components/AddSchedule';



// PrivateRoute is a wrapper component that protects routes from unauthorized access, you have to be logged in to access the profile page   
const PrivateRoute = ({ children }) => {
    // Check if user is authenticated by looking for token
    const token = localStorage.getItem('token');
    
    // If authenticated, render the protected component
    // If not, redirect to login page
    return token ? children : <Navigate to="/login" />;
};

function App() {
    return (
        <>
            <Navbar />
            <Routes>
                <Route path="/" element={<>
                                            <TrendingMovies/>
                                            <ReviewsPage />
                                        </>} />
                <Route path="/showtime" element={<Schedules />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/filter" element={<FilterPage />} />
                <Route path="/movie/:id" element={<MovieDetail />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/verification-success" element={<EmailVerificationSuccess />} />
                <Route path="/profile/:userId" element={<ProfilePage />} />
                <Route path="/favorites" element={
                    <PrivateRoute>
                        <FavoritesList />
                    </PrivateRoute>
                } />
                <Route path="/favorites/:userId" element={<SharedFavorites />} />
                <Route path="/groups" element={<GroupList />} />
                <Route path="/group/:id" element={
                    <PrivateRoute>
                        <GroupPage />
                    </PrivateRoute>
                } />
                <Route path="/create-group" element={
                    <PrivateRoute>
                        <CreateGroup />
                    </PrivateRoute>
                } />
                <Route path="/groups/:id/add-movie" element={<AddMovie />} />
                <Route path="/groups/:id/add-schedule" element={<AddSchedule />} />
            </Routes>
            <Footer />
        </>
    );
}

export default App;